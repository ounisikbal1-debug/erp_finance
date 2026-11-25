import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()

def get_category(code, account_type):
    c = str(code).strip()
    if c == 'STOCK-GROUP-TEST':
        return 'INVENTORY'
    if c == 'STOCK-CHARGES-GROUP-TEST':
        return 'OPERATING_EXPENSE'
    
    # Direct mappings
    if c.startswith('101') or c.startswith('111') or c.startswith('118') or c.startswith('120') or c.startswith('131'):
        return 'EQUITY'
    if c.startswith('15') or c.startswith('16'):
        return 'NONCURRENT_LIABILITY'
    if c.startswith('21') or c.startswith('22') or c.startswith('23') or c.startswith('28'):
        return 'NONCURRENT_ASSET'
    if c.startswith('31') or c.startswith('32') or c.startswith('33') or c.startswith('35') or c.startswith('37') or c.startswith('39'):
        return 'INVENTORY'
    if c.startswith('401') or c.startswith('404') or c.startswith('408') or c.startswith('409'):
        return 'TRADE_PAYABLE'
    if c.startswith('411') or c.startswith('416') or c.startswith('418') or c.startswith('419'):
        return 'TRADE_RECEIVABLE'
    if c.startswith('4366'):
        return 'OTHER_CURRENT_ASSET'
    if c.startswith('42') or c.startswith('43') or c.startswith('44') or c.startswith('45') or c.startswith('46') or c.startswith('47'):
        return 'OTHER_CURRENT_LIABILITY'
    if c.startswith('53') or c.startswith('54') or c.startswith('58') or c.startswith('50') or c.startswith('51'):
        return 'CASH_EQUIVALENT'
    if c.startswith('601') or c.startswith('602') or c.startswith('607'):
        return 'PURCHASES'
    if c.startswith('603'):
        return 'COST_OF_GOODS_SOLD'
    if c.startswith('661') or c.startswith('66'):
        return 'INTEREST_EXPENSE'
    if c.startswith('68'):
        return 'DEPRECIATION_AMORTIZATION'
    if c.startswith('69'):
        return 'INCOME_TAX_EXPENSE'
    if c.startswith('6'):
        return 'OPERATING_EXPENSE'
    if c.startswith('70'):
        return 'REVENUE'
    if c.startswith('75'):
        return 'FINANCIAL_INCOME'
    if c.startswith('77'):
        return 'EXCEPTIONAL_INCOME'
    if c.startswith('7'):
        return 'OTHER_OPERATING_INCOME'
    
    # Fallback by account_type
    if account_type == 'Asset': return 'OTHER_CURRENT_ASSET'
    if account_type == 'Liability': return 'OTHER_CURRENT_LIABILITY'
    if account_type == 'Equity': return 'EQUITY'
    if account_type == 'Revenue': return 'REVENUE'
    if account_type == 'Expense': return 'OPERATING_EXPENSE'
    return 'OPERATING_EXPENSE'

accounts = cur.execute('SELECT id, code, type, financialCategory FROM ChartOfAccount').fetchall()
updated = 0
for acc_id, code, acc_type, fin_cat in accounts:
    cat = get_category(code, acc_type)
    if fin_cat != cat:
        cur.execute('UPDATE ChartOfAccount SET financialCategory = ? WHERE id = ?', (cat, acc_id))
        updated += 1

conn.commit()
print(f"Updated financialCategory for {updated} of {len(accounts)} accounts in ChartOfAccount.")

# Verify unclassified accounts
null_cats = cur.execute('SELECT COUNT(*) FROM ChartOfAccount WHERE financialCategory IS NULL').fetchone()[0]
print(f"Remaining accounts with NULL financialCategory: {null_cats}")
