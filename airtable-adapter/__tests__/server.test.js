const request = require('supertest');
const { createApp } = require('../src/server');
const { FakeTable } = require('./fakeTable');

function makeTask(i) {
  return {
    id: `task-${i}`,
    title: `Task ${i}`,
    description: null,
    status: 'todo',
    assigneeEmail: null,
    assigneeName: null,
    projectId: 'proj-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('POST /export', () => {
  it('exports tasks and returns a summary', async () => {
    const table = new FakeTable();
    const app = createApp({
      apiKey: 'key',
      baseId: 'base',
      tableName: 'Tasks',
      tableFactory: () => table,
    });

    const res = await request(app)
      .post('/export')
      .send({ tasks: [makeTask(1), makeTask(2)] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 2, created: 2, updated: 0, failed: [] });
  });

  it('rejects a non-array tasks payload', async () => {
    const app = createApp({ apiKey: 'key', baseId: 'base', tableFactory: () => new FakeTable() });
    const res = await request(app).post('/export').send({ tasks: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when Airtable credentials are not configured', async () => {
    const app = createApp({ tableFactory: () => new FakeTable() });
    const res = await request(app).post('/export').send({ tasks: [] });
    expect(res.status).toBe(500);
  });

  it('enforces the shared secret when one is configured', async () => {
    const app = createApp({
      apiKey: 'key',
      baseId: 'base',
      sharedSecret: 'super-secret',
      tableFactory: () => new FakeTable(),
    });

    const unauthorized = await request(app).post('/export').send({ tasks: [] });
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post('/export')
      .set('x-internal-api-key', 'super-secret')
      .send({ tasks: [] });
    expect(authorized.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('reports ok', async () => {
    const app = createApp({});
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
