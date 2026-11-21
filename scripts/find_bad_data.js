const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('src/data/data.db');

db.all('PRAGMA table_info(JournalEntry)', (err, cols) => {
  console.log('Columns in JournalEntry:', cols.map(c => `${c.name} (${c.type})`));
  db.all('SELECT * FROM JournalEntry WHERE entityId = "f3a4d90d-440c-4f3c-9c56-ae72507ca6c2"', (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Checking ${rows.length} rows in JournalEntry...`);
    let badCount = 0;
    for (const r of rows) {
      // Check date fields
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'string' && (k.toLowerCase().includes('date') || k.toLowerCase().includes('at'))) {
          // Check if valid ISO date or timestamp
          const d = new Date(v);
          if (isNaN(d.getTime())) {
            console.log(`Bad date in row ${r.id}, col ${k}: "${v}"`);
            badCount++;
          }
        }
      }
    }
    console.log(`Found ${badCount} bad date fields in JournalEntry.`);
    db.close();
  });
});
