const { FakeTable } = require('./fakeTable');
const { exportTasks, findExistingRecordIds, TASK_ID_FIELD } = require('../src/exportService');

function makeTask(i, overrides = {}) {
  return {
    id: `task-${i}`,
    title: `Task ${i}`,
    description: 'desc',
    status: 'todo',
    assigneeEmail: 'user@example.com',
    assigneeName: 'User Example',
    projectId: 'proj-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('findExistingRecordIds', () => {
  it('paginates through every page of existing records to find matches', async () => {
    const seedRecords = Array.from({ length: 250 }, (_, i) => ({
      id: `rec_${i}`,
      fields: { [TASK_ID_FIELD]: `task-${i}` },
    }));
    const table = new FakeTable({ seedRecords });

    const wanted = ['task-0', 'task-99', 'task-249', 'task-does-not-exist'];
    const idMap = await findExistingRecordIds(table, wanted);

    expect(idMap.get('task-0')).toBe('rec_0');
    expect(idMap.get('task-99')).toBe('rec_99');
    expect(idMap.get('task-249')).toBe('rec_249');
    expect(idMap.has('task-does-not-exist')).toBe(false);
  });
});

describe('exportTasks: idempotency', () => {
  it('creates records on first export and updates the same records on re-export, never duplicating', async () => {
    const table = new FakeTable();
    const tasks = Array.from({ length: 15 }, (_, i) => makeTask(i));

    const first = await exportTasks(table, tasks);
    expect(first).toEqual({ total: 15, created: 15, updated: 0, failed: [] });
    expect(table.records).toHaveLength(15);

    const changed = tasks.map((t) => ({ ...t, status: 'done' }));
    const second = await exportTasks(table, changed);
    expect(second).toEqual({ total: 15, created: 0, updated: 15, failed: [] });
    expect(table.records).toHaveLength(15);

    for (const rec of table.records) {
      expect(rec.fields.Status).toBe('done');
    }
  });
});

describe('exportTasks: retries', () => {
  it('retries a transient failure and still succeeds', async () => {
    const table = new FakeTable();
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(i));

    let attempts = 0;
    table.createHandler = (records) => {
      attempts += 1;
      if (attempts <= 2) {
        const err = new Error('Service Unavailable');
        err.statusCode = 503;
        throw err;
      }
      return records.map((r, i2) => ({ id: `rec_ok_${i2}`, fields: r.fields }));
    };

    const result = await exportTasks(table, tasks);
    expect(result.created).toBe(5);
    expect(result.failed).toEqual([]);
    expect(attempts).toBe(3);
  }, 10000);

  it('does not retry a permanent error and reports it as failed', async () => {
    const table = new FakeTable();
    const tasks = [makeTask(1)];

    table.createHandler = () => {
      const err = new Error('Bad request');
      err.statusCode = 400;
      throw err;
    };

    const result = await exportTasks(table, tasks);
    expect(result.created).toBe(0);
    expect(result.failed).toEqual([{ taskId: 'task-1', error: 'Bad request' }]);
    // batch call (1 record) fails permanently, then the per-record fallback retries it once more
    expect(table.createAttempts).toBe(2);
  });
});

describe('exportTasks: partial batch failure', () => {
  it('isolates one permanently-invalid record without dropping the rest of the batch', async () => {
    const table = new FakeTable();
    const tasks = [makeTask(1), makeTask(2, { title: 'BAD' }), makeTask(3)];

    table.createHandler = (records) => {
      if (records.length > 1) {
        const err = new Error('Invalid batch');
        err.statusCode = 422;
        throw err;
      }
      const [record] = records;
      if (record.fields.Title === 'BAD') {
        const err = new Error('Unknown field value');
        err.statusCode = 422;
        throw err;
      }
      return [{ id: `rec_${record.fields[TASK_ID_FIELD]}`, fields: record.fields }];
    };

    const result = await exportTasks(table, tasks);
    expect(result.created).toBe(2);
    expect(result.failed).toEqual([{ taskId: 'task-2', error: 'Unknown field value' }]);
  });
});

describe('exportTasks: large volume', () => {
  it('handles ~1000 records, batching creates in groups of at most 10', async () => {
    const table = new FakeTable();
    const tasks = Array.from({ length: 1000 }, (_, i) => makeTask(i));

    const result = await exportTasks(table, tasks);

    expect(result).toEqual({ total: 1000, created: 1000, updated: 0, failed: [] });
    expect(table.createAttempts).toBe(100); // 1000 / batch size 10
    for (const call of table.createCalls) {
      expect(call.length).toBeLessThanOrEqual(10);
    }
  });

  it('re-exporting ~1000 records updates all of them in batches of at most 10', async () => {
    const table = new FakeTable();
    const tasks = Array.from({ length: 1000 }, (_, i) => makeTask(i));
    await exportTasks(table, tasks);

    const result = await exportTasks(table, tasks.map((t) => ({ ...t, status: 'done' })));

    expect(result).toEqual({ total: 1000, created: 0, updated: 1000, failed: [] });
    for (const call of table.updateCalls) {
      expect(call.length).toBeLessThanOrEqual(10);
    }
  });
});
