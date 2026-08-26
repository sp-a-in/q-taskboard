const Airtable = require('airtable');

/**
 * Builds an Airtable base handle. This is the only module allowed to touch
 * the `airtable` package directly, and the only place Airtable credentials
 * ever get read.
 */
function createBase({ apiKey, baseId, endpointUrl }) {
  const config = { apiKey };
  if (endpointUrl) config.endpointUrl = endpointUrl;
  return new Airtable(config).base(baseId);
}

module.exports = { createBase };
