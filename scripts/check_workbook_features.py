import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()
rows = cur.execute("SELECT entityId, featureKey, enabled, configurationJson FROM WorkbookFeatureConfiguration").fetchall()
print(f"Total WorkbookFeatureConfiguration rows: {len(rows)}")
for r in rows:
    print(r[0], r[1], r[2], r[3][:60])
