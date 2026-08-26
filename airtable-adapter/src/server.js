const express = require('express');
const { createBase } = require('./airtableClient');
const { exportTasks } = require('./exportService');

/**
 * Creates the adapter's HTTP app. Config is injected so tests never need
 * real Airtable credentials or a network connection.
 */
function createApp({ apiKey, baseId, tableName, sharedSecret, tableFactory } = {}) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const getTable = tableFactory || (() => createBase({ apiKey, baseId })(tableName));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/export', async (req, res) => {
    if (sharedSecret) {
      const provided = req.get('x-internal-api-key');
      if (provided !== sharedSecret) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const { tasks } = req.body || {};
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'tasks must be an array' });
    }
    if (!apiKey || !baseId) {
      return res.status(500).json({ error: 'airtable adapter is not configured' });
    }

    try {
      const table = getTable();
      const result = await exportTasks(table, tasks);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: 'airtable export failed', message: err.message || String(err) });
    }
  });

  return app;
}

module.exports = { createApp };
