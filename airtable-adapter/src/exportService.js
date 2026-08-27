const { withRetry, defaultIsRetryable } = require('./retry');

const TASK_ID_FIELD = 'TaskBoard Task ID';
const BATCH_SIZE = 10;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function taskToFields(task) {
  return {
    [TASK_ID_FIELD]: task.id,
    Title: task.title,
    Description: task.description || '',
    Status: task.status,
    Assignee: task.assigneeName || task.assigneeEmail || '',
    'Project ID': task.projectId || '',
    'Created At': task.createdAt || null,
    'Updated At': task.updatedAt || null,
  };
}

/**
 * Finds Airtable record ids for the given task ids, handling pagination
 * transparently via airtable.js's eachPage callback.
 */
async function findExistingRecordIds(table, taskIds) {
  const wanted = new Set(taskIds);
  const idMap = new Map();
  if (wanted.size === 0) return idMap;

  await new Promise((resolve, reject) => {
    table
      .select({ fields: [TASK_ID_FIELD], pageSize: 100 })
      .eachPage(
        (records, fetchNextPage) => {
          for (const record of records) {
            const taskId = record.get(TASK_ID_FIELD);
            if (taskId && wanted.has(taskId)) {
              idMap.set(taskId, record.id);
            }
          }
          fetchNextPage();
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
  });

  return idMap;
}

async function retryable(fn) {
  return withRetry(fn, { isRetryable: defaultIsRetryable });
}

async function createOne(table, task, idMap, results) {
  try {
    const [created] = await retryable(() =>
      table.create([{ fields: taskToFields(task) }], { typecast: true }),
    );
    idMap.set(task.id, created.id);
    results.created.push(task.id);
  } catch (err) {
    results.failed.push({ taskId: task.id, error: err.message || String(err) });
  }
}

async function updateOne(table, task, idMap, results) {
  try {
    await retryable(() =>
      table.update([{ id: idMap.get(task.id), fields: taskToFields(task) }], { typecast: true }),
    );
    results.updated.push(task.id);
  } catch (err) {
    results.failed.push({ taskId: task.id, error: err.message || String(err) });
  }
}

async function createBatch(table, tasks, idMap, results) {
  try {
    const created = await retryable(() =>
      table.create(
        tasks.map((task) => ({ fields: taskToFields(task) })),
        { typecast: true },
      ),
    );
    created.forEach((record, i) => {
      idMap.set(tasks[i].id, record.id);
      results.created.push(tasks[i].id);
    });
  } catch (err) {
    // One bad record must not sink the other 9 in the batch — fall back to
    // per-record calls so we can isolate and report the actual failure.
    for (const task of tasks) {
      await createOne(table, task, idMap, results);
    }
  }
}

async function updateBatch(table, tasks, idMap, results) {
  try {
    await retryable(() =>
      table.update(
        tasks.map((task) => ({ id: idMap.get(task.id), fields: taskToFields(task) })),
        { typecast: true },
      ),
    );
    tasks.forEach((task) => results.updated.push(task.id));
  } catch (err) {
    for (const task of tasks) {
      await updateOne(table, task, idMap, results);
    }
  }
}

/**
 * Upserts every task into Airtable, matching on the stable TaskBoard Task ID
 * so repeated exports update existing records instead of duplicating them.
 */
async function exportTasks(table, tasks) {
  const results = { created: [], updated: [], failed: [] };
  const idMap = await findExistingRecordIds(table, tasks.map((t) => t.id));

  const toCreate = tasks.filter((t) => !idMap.has(t.id));
  const toUpdate = tasks.filter((t) => idMap.has(t.id));

  for (const group of chunk(toCreate, BATCH_SIZE)) {
    await createBatch(table, group, idMap, results);
  }
  for (const group of chunk(toUpdate, BATCH_SIZE)) {
    await updateBatch(table, group, idMap, results);
  }

  return {
    total: tasks.length,
    created: results.created.length,
    updated: results.updated.length,
    failed: results.failed,
  };
}

module.exports = {
  exportTasks,
  findExistingRecordIds,
  taskToFields,
  TASK_ID_FIELD,
  BATCH_SIZE,
  chunk,
};
