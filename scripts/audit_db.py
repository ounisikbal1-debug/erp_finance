import sqlite3

con = sqlite3.connect('src/data/data.db')
cur = con.cursor()
tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Total tables: {len(tables)}")
print(f"Has _prisma_migrations: {'_prisma_migrations' in tables}")
print(f"Has Currency: {'Currency' in tables}")
print(f"Has PayrollRule: {'PayrollRule' in tables}")
print(f"Has StockMovement: {'StockMovement' in tables}")
cur.close()
con.close()
