import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()

# Get countryId for TN
tn_country_id = cur.execute("SELECT id FROM CountryProfile WHERE code = 'TN'").fetchone()[0]

# Find all distinct accountCode in JournalLine that are NOT in ChartOfAccount
missing_in_chart = cur.execute("""
    SELECT DISTINCT jl.accountCode
    FROM JournalLine jl
    WHERE jl.accountCode NOT IN (SELECT code FROM ChartOfAccount WHERE countryId = ?)
""", (tn_country_id,)).fetchall()

print(f"Missing accounts in ChartOfAccount: {len(missing_in_chart)}")
for m in missing_in_chart:
    print(m[0])
