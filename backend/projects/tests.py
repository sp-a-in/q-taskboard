import pytest
from rest_framework.test import APIClient
from users.models import User
from projects.models import Project, Membership, Task, Comment


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


@pytest.mark.django_db
class TestProjects:
    def test_create_project(self, auth_client, user):
        response = auth_client.post('/api/projects', {'name': 'My Project'}, format='json')
        assert response.status_code == 201
        assert response.data['project']['name'] == 'My Project'

    def test_list_only_returns_member_projects(self, auth_client, user):
        p1 = Project.objects.create(name='Mine', owner=user)
        Membership.objects.create(user=user, project=p1, role='admin')
        other = User.objects.create_user(email='other@example.com', name='Other', password='password123')
        p2 = Project.objects.create(name='Not Mine', owner=other)
        Membership.objects.create(user=other, project=p2, role='admin')

        response = auth_client.get('/api/projects')
        assert response.status_code == 200
        names = [p['name'] for p in response.data['projects']]
        assert 'Mine' in names
        assert 'Not Mine' not in names

    def test_get_project_detail(self, auth_client, user):
        project = Project.objects.create(name='My Project', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.get(f'/api/projects/{project.id}')
        assert response.status_code == 200
        assert response.data['project']['name'] == 'My Project'

    def test_non_member_cannot_view_project(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='Private', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/projects/{project.id}')
        assert response.status_code == 403


@pytest.mark.django_db
class TestTasks:
    def test_create_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.post(f'/api/projects/{project.id}/tasks', {'title': 'Do a thing'}, format='json')
        assert response.status_code == 201
        assert response.data['task']['title'] == 'Do a thing'

    def test_viewers_cannot_create_tasks(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/projects/{project.id}/tasks', {'title': 'A task'}, format='json')
        assert response.status_code == 403

    def test_delete_task_requires_membership(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.delete(f'/api/tasks/{task.id}')
        assert response.status_code == 403

    def test_non_member_cannot_patch_task(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.patch(f'/api/tasks/{task.id}', {'title': 'Hacked'}, format='json')
        assert response.status_code == 403
        task.refresh_from_db()
        assert task.title == 'A task'

    def test_viewer_cannot_patch_task(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.patch(f'/api/tasks/{task.id}', {'title': 'Hacked'}, format='json')
        assert response.status_code == 403
        task.refresh_from_db()
        assert task.title == 'A task'

    def test_member_can_patch_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='member')
        task = Task.objects.create(project=project, title='Old title', created_by=user)

        response = auth_client.patch(f'/api/tasks/{task.id}', {'title': 'New title'}, format='json')
        assert response.status_code == 200
        assert response.data['task']['title'] == 'New title'
        task.refresh_from_db()
        assert task.title == 'New title'


@pytest.mark.django_db
class TestComments:
    def test_member_can_post_comment(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='member')
        task = Task.objects.create(project=project, title='T', created_by=user)

        response = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': 'looks good'}, format='json')
        assert response.status_code == 201
        assert response.data['comment']['body'] == 'looks good'
        assert response.data['comment']['author']['email'] == 'meera@taskboard.dev'
        assert Comment.objects.filter(task=task).count() == 1

    def test_admin_can_post_comment(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=user)

        response = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': 'ship it'}, format='json')
        assert response.status_code == 201
        assert response.data['comment']['body'] == 'ship it'

    def test_viewer_can_read_comments(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        task = Task.objects.create(project=project, title='T', created_by=owner)
        Comment.objects.create(task=task, author=owner, body='an update')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/tasks/{task.id}/comments')
        assert response.status_code == 200
        assert len(response.data['comments']) == 1
        assert response.data['comments'][0]['body'] == 'an update'

    def test_viewer_cannot_post_comment(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        task = Task.objects.create(project=project, title='T', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/tasks/{task.id}/comments', {'body': 'nope'}, format='json')
        assert response.status_code == 403
        assert Comment.objects.filter(task=task).count() == 0

    def test_non_member_cannot_read_comments(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=owner)
        Comment.objects.create(task=task, author=owner, body='secret')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/tasks/{task.id}/comments')
        assert response.status_code == 403

    def test_non_member_cannot_post_comment(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/tasks/{task.id}/comments', {'body': 'sneaky'}, format='json')
        assert response.status_code == 403
        assert Comment.objects.filter(task=task).count() == 0

    def test_comments_returned_in_chronological_order(self, auth_client, user):
        from datetime import timedelta
        from django.utils import timezone

        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=user)

        c1 = Comment.objects.create(task=task, author=user, body='first')
        c2 = Comment.objects.create(task=task, author=user, body='second')
        c3 = Comment.objects.create(task=task, author=user, body='third')
        base = timezone.now()
        Comment.objects.filter(id=c1.id).update(created_at=base)
        Comment.objects.filter(id=c2.id).update(created_at=base + timedelta(seconds=1))
        Comment.objects.filter(id=c3.id).update(created_at=base + timedelta(seconds=2))

        response = auth_client.get(f'/api/tasks/{task.id}/comments')
        assert response.status_code == 200
        bodies = [c['body'] for c in response.data['comments']]
        assert bodies == ['first', 'second', 'third']

    def test_empty_body_rejected(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=user)

        response = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': ''}, format='json')
        assert response.status_code == 400
        assert Comment.objects.filter(task=task).count() == 0

    def test_whitespace_only_body_rejected(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=user)

        response = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': '   '}, format='json')
        assert response.status_code == 400
        assert Comment.objects.filter(task=task).count() == 0

    def test_comments_endpoint_has_no_update_or_delete(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='T', created_by=user)
        comment = Comment.objects.create(task=task, author=user, body='original')

        patch_response = auth_client.patch(f'/api/tasks/{task.id}/comments', {'body': 'edited'}, format='json')
        assert patch_response.status_code == 405

        delete_response = auth_client.delete(f'/api/tasks/{task.id}/comments')
        assert delete_response.status_code == 405

        comment.refresh_from_db()
        assert comment.body == 'original'
