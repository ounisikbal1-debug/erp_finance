const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('src/data/data.db');

db.all('SELECT id, entryNumber, date, createdAt, approvedAt, postedAt FROM JournalEntry WHERE entityId = "f3a4d90d-440c-4f3c-9c56-ae72507ca6c2"', (err, rows) => {
  if (err) throw err;
  console.log(`Checking types of ${rows.length} rows...`);
  const typeCounts = {};
  const sampleBad = [];
  for (const r of rows) {
    for (const f of ['date', 'createdAt', 'approvedAt', 'postedAt']) {
      const val = r[f];
      const t = val === null ? 'null' : typeof val;
      const key = `${f}:${t}`;
      typeCounts[key] = (typeCounts[key] || 0) + 1;
      if (typeof val === 'string') {
        // test if parseable by Prisma Date
        if (!/^\d{4}-\d{2}-\d{2}/.test(val) && isNaN(Number(val))) {
          sampleBad.push({ id: r.id, entryNumber: r.entryNumber, field: f, val });
        }
      }
    }
  }
  console.log('Type counts:', typeCounts);
  console.log(`Bad samples (${sampleBad.length}):`, sampleBad.slice(0, 10));
  db.close();
});
