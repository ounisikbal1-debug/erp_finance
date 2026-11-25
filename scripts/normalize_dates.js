const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('src/data/data.db');

db.serialize(() => {
  // Let's inspect all tables that have DATETIME columns
  db.all('SELECT id, date, createdAt, approvedAt, postedAt FROM JournalEntry', (err, rows) => {
    if (err) throw err;
    console.log(`Checking ${rows.length} rows...`);
    let fixed = 0;
    const stmt = db.prepare('UPDATE JournalEntry SET date = ?, createdAt = ?, approvedAt = ?, postedAt = ? WHERE id = ?');
    
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

    for (const r of rows) {
      const newDate = normalize(r.date);
      const newCreatedAt = normalize(r.createdAt);
      const newApprovedAt = normalize(r.approvedAt);
      const newPostedAt = normalize(r.postedAt);

      if (newDate !== r.date || newCreatedAt !== r.createdAt || newApprovedAt !== r.approvedAt || newPostedAt !== r.postedAt) {
        stmt.run(newDate, newCreatedAt, newApprovedAt, newPostedAt, r.id);
        fixed++;
      }
    }
    stmt.finalize();
    console.log(`Normalized ${fixed} rows in JournalEntry to integer timestamps.`);
    db.close();
  });
});
