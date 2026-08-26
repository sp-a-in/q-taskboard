const path = require('path');
// Docker injects env vars directly; this only matters for running the
// adapter manually (outside docker-compose), so it's a silent no-op if the
// repo-root .env doesn't exist.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { createApp } = require('./server');

const app = createApp({
  apiKey: process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: process.env.AIRTABLE_TABLE_NAME || 'Tasks',
  sharedSecret: process.env.ADAPTER_SHARED_SECRET || '',
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`airtable-adapter listening on port ${port}`);
});
