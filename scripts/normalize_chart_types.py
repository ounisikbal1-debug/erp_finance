import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()
cur.execute("UPDATE ChartOfAccount SET type = 'Asset' WHERE UPPER(type) = 'ASSET'")
cur.execute("UPDATE ChartOfAccount SET type = 'Liability' WHERE UPPER(type) = 'LIABILITY'")
cur.execute("UPDATE ChartOfAccount SET type = 'Equity' WHERE UPPER(type) = 'EQUITY'")
cur.execute("UPDATE ChartOfAccount SET type = 'Revenue' WHERE UPPER(type) = 'REVENUE'")
cur.execute("UPDATE ChartOfAccount SET type = 'Expense' WHERE UPPER(type) = 'EXPENSE'")
conn.commit()
print("Normalized ChartOfAccount types to TitleCase.")

cur.execute("UPDATE ChartOfAccount SET isPostingAllowed = 1 WHERE code IN ('STOCK-CHARGES-GROUP-TEST', 'STOCK-GROUP-TEST')")
conn.commit()
print("Updated stock group test accounts to isPostingAllowed = 1.")

tn_id = cur.execute("SELECT id FROM CountryProfile WHERE code = 'TN'").fetchone()[0]
cur.execute("INSERT OR REPLACE INTO ChartOfAccount (id, countryId, code, description, classNumber, type, financialCategory, parentId, isPostingAllowed, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ('chart-602-tn', tn_id, '602', 'Achats dâ€™autres approvisionnements et matiÃ¨res consommables', 6, 'Expense', 'PURCHASES', None, 1, int(1730000000000)))
conn.commit()
print("Added 602 to ChartOfAccount.")
