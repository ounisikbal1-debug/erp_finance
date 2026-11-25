const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('src/data/data.db');

function normalize(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const d = new Date(v.replace(' ', 'T') + (v.endsWith('Z') || v.includes('+') ? '' : 'Z'));
    if (!isNaN(d.getTime())) {
      return d.getTime();
    }
  }
  return v;
}

db.all('SELECT name FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%" AND name NOT LIKE "_prisma_%"', async (err, tables) => {
  if (err) throw err;
  for (const table of tables) {
    const tname = table.name;
    const cols = await new Promise((res, rej) => db.all(`PRAGMA table_info("${tname}")`, (e, c) => e ? rej(e) : res(c)));
    const dateCols = cols.filter(c => c.type === 'DATETIME' || c.name.toLowerCase().includes('date') || c.name.toLowerCase().endsWith('at'));
    if (dateCols.length === 0) continue;

    const rows = await new Promise((res, rej) => db.all(`SELECT * FROM "${tname}"`, (e, r) => e ? rej(e) : res(r)));
    let tableFixed = 0;
    for (const r of rows) {
      const updates = [];
      const values = [];
      for (const col of dateCols) {
        const cname = col.name;
        const val = r[cname];
        if (typeof val === 'string' && val.length > 0) {
          const norm = normalize(val);
          if (norm !== val) {
            updates.push(`"${cname}" = ?`);
            values.push(norm);
          }
        }
      }
      if (updates.length > 0) {
        values.push(r.id || Object.values(r)[0]);
        const idCol = cols.find(c => c.pk === 1)?.name || 'id';
        await new Promise((res, rej) => db.run(`UPDATE "${tname}" SET ${updates.join(', ')} WHERE "${idCol}" = ?`, values, (e) => e ? rej(e) : res()));
        tableFixed++;
      }
    }
    if (tableFixed > 0) {
      console.log(`Table ${tname}: Normalized ${tableFixed} rows.`);
    }
  }
  console.log('All date normalization complete across all SQLite tables.');
  db.close();
});
