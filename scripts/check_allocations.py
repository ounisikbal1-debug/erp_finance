import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()
tables = [t[0] for t in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
matched = [t for t in tables if any(k in t.lower() for k in ['pay', 'alloc', 'invoice', 'settle'])]
print('Matched tables:', matched)

for t in matched:
    count = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t}: {count} rows")
