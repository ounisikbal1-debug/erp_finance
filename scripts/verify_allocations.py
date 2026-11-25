import sqlite3

conn = sqlite3.connect('src/data/data.db')
cur = conn.cursor()

print("--- SALES INVOICE PAYMENTS CHECK ---")
sales_check = cur.execute("""
    SELECT i.id, i.invoiceNumber, i.totalAmount, COALESCE(SUM(cp.amount), 0) as paid
    FROM Invoice i
    LEFT JOIN CashflowPayment cp ON cp.invoiceId = i.id
    GROUP BY i.id, i.invoiceNumber, i.totalAmount
""").fetchall()

overpaid_sales = [r for r in sales_check if r[3] > r[2] + 0.001]
underpaid_sales = [r for r in sales_check if r[3] < r[2] - 0.001]
exact_sales = [r for r in sales_check if abs(r[3] - r[2]) <= 0.001]
print(f"Total sales invoices: {len(sales_check)}")
print(f"  Exact paid: {len(exact_sales)}")
print(f"  Overpaid: {len(overpaid_sales)}")
print(f"  Underpaid: {len(underpaid_sales)}")
if overpaid_sales:
    print("  Sample overpaid:", overpaid_sales[:3])

print("\n--- PURCHASE INVOICE PAYMENTS CHECK ---")
purch_check = cur.execute("""
    SELECT pi.id, pi.invoiceNumber, pi.totalAmount, COALESCE(SUM(cp.amount), 0) as paid
    FROM PurchaseInvoice pi
    LEFT JOIN CashflowPayment cp ON cp.purchaseInvoiceId = pi.id
    GROUP BY pi.id, pi.invoiceNumber, pi.totalAmount
""").fetchall()

overpaid_purch = [r for r in purch_check if r[3] > r[2] + 0.001]
underpaid_purch = [r for r in purch_check if r[3] < r[2] - 0.001]
exact_purch = [r for r in purch_check if abs(r[3] - r[2]) <= 0.001]
print(f"Total purchase invoices: {len(purch_check)}")
print(f"  Exact paid: {len(exact_purch)}")
print(f"  Overpaid: {len(overpaid_purch)}")
print(f"  Underpaid: {len(underpaid_purch)}")
if overpaid_purch:
    print("  Sample overpaid:", overpaid_purch[:3])

print("\n--- ORPHAN CASHFLOW PAYMENTS ---")
orphans = cur.execute("""
    SELECT COUNT(*) FROM CashflowPayment
    WHERE invoiceId IS NULL AND purchaseInvoiceId IS NULL
""").fetchone()[0]
print(f"Orphan payments without invoice: {orphans}")
