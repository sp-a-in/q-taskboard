from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from users.models import User
from projects.models import Project, Membership, Task
from projects.airtable_client import AirtableAdapterError
from projects.airtable_mock import MockAirtableAdapter


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email='meera@taskboard.dev', name='Meera Iyer', password='password123')


@pytest.fixture
def auth_client(client, user):
    response = client.post('/api/auth/login', {
        'email': 'meera@taskboard.dev',
        'password': 'password123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")
    return client


def login_as(client, email='meera@taskboard.dev', password='password123'):
    resp = client.post('/api/auth/login', {'email': email, 'password': password}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")
    return client


@pytest.mark.django_db
class TestExportAuthorization:
    def test_admin_can_export(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='T1', created_by=user)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = auth_client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 200
        assert response.data['export']['total'] == 1

    def test_member_can_export(self, auth_client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='member')
        Task.objects.create(project=project, title='T1', created_by=owner)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = auth_client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 200
        assert len(mock_adapter.calls) == 1

    def test_viewer_cannot_export(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        Task.objects.create(project=project, title='T1', created_by=owner)
        login_as(client)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 403
        assert mock_adapter.calls == []

    def test_non_member_cannot_export(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='Private', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        login_as(client)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 403
        assert mock_adapter.calls == []


@pytest.mark.django_db
class TestExportAdapterInteraction:
    def test_every_task_in_the_project_is_included(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        for i in range(5):
            Task.objects.create(project=project, title=f'T{i}', created_by=user)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = auth_client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 200
        sent_tasks = mock_adapter.calls[0]
        assert len(sent_tasks) == 5
        assert response.data['export']['total'] == 5

    def test_task_uuid_is_sent_as_the_stable_id(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T1', created_by=user)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            auth_client.post(f'/api/projects/{project.id}/export')

        sent_task = mock_adapter.calls[0][0]
        assert sent_task['id'] == str(task.id)

    def test_repeated_export_updates_instead_of_duplicating(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='T1', created_by=user)

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            first = auth_client.post(f'/api/projects/{project.id}/export')
            second = auth_client.post(f'/api/projects/{project.id}/export')

        assert first.data['export']['created'] == 1
        assert first.data['export']['updated'] == 0
        assert second.data['export']['created'] == 0
        assert second.data['export']['updated'] == 1

    def test_adapter_failure_returns_502_without_crashing(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='T1', created_by=user)

        mock_adapter = MockAirtableAdapter()
        mock_adapter.raise_error = AirtableAdapterError('could not reach the airtable adapter')
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = auth_client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 502
        assert 'error' in response.data

    def test_export_works_with_no_tasks(self, auth_client, user):
        project = Project.objects.create(name='Empty', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        mock_adapter = MockAirtableAdapter()
        with patch('projects.views.export_project_tasks', mock_adapter.export_project_tasks):
            response = auth_client.post(f'/api/projects/{project.id}/export')

        assert response.status_code == 200
        assert response.data['export']['total'] == 0
