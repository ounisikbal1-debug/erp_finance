import sqlite3

con = sqlite3.connect('src/data/data.db')
cur = con.cursor()
rows = cur.execute("SELECT code, description, classNumber, type FROM ChartOfAccount WHERE code LIKE '3%' OR code LIKE '603%' ORDER BY code").fetchall()
print(f"Total comptes de stocks trouvés : {len(rows)}")
for r in rows:
    print(f"  [{r[0]}] {r[1]} (Classe {r[2]}, Type: {r[3]})")
cur.close()
con.close()
