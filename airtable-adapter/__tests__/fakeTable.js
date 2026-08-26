/**
 * In-memory stand-in for an airtable.js Table, used only in this package's
 * own tests so we never need real Airtable credentials or network access.
 */
class FakeTable {
  constructor({ seedRecords = [] } = {}) {
    this.records = seedRecords.map((r) => ({ ...r }));
    this._seq = seedRecords.length;
    this.createAttempts = 0;
    this.updateAttempts = 0;
    this.createCalls = [];
    this.updateCalls = [];
    this.createHandler = null;
    this.updateHandler = null;
  }

  select({ pageSize = 100 } = {}) {
    const snapshot = this.records.map((r) => ({ id: r.id, get: (field) => r.fields[field] }));
    return {
      eachPage: (onPage, onDone) => {
        let i = 0;
        const next = () => {
          if (i >= snapshot.length) {
            onDone(null);
            return;
          }
          const page = snapshot.slice(i, i + pageSize);
          i += pageSize;
          onPage(page, next);
        };
        next();
      },
    };
  }

  async create(records, opts) {
    this.createAttempts += 1;
    this.createCalls.push(records);
    if (this.createHandler) {
      return this.createHandler(records, this.createAttempts);
    }
    return records.map((r) => {
      this._seq += 1;
      const rec = { id: `rec_new_${this._seq}`, fields: r.fields };
      this.records.push(rec);
      return { id: rec.id, fields: rec.fields };
    });
  }

  async update(records) {
    this.updateAttempts += 1;
    this.updateCalls.push(records);
    if (this.updateHandler) {
      return this.updateHandler(records, this.updateAttempts);
    }
    return records.map((r) => {
      const existing = this.records.find((rec) => rec.id === r.id);
      if (existing) existing.fields = { ...existing.fields, ...r.fields };
      return { id: r.id, fields: r.fields };
    });
  }
}

module.exports = { FakeTable };
