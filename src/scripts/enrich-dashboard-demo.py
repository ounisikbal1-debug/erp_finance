import argparse
import datetime as dt
import os
import pathlib
import sqlite3
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA_DIR = (ROOT / "src" / "data").resolve()
ENTITY_CODE = "SAFE-DEMO-001"
RUN_MARKER = "SAFE-SYNTHETIC-COMPLETE-2026"
AS_OF = dt.date(2026, 11, 9)

COUNTRY_CONFIG = [
    {"code": "ZZ", "name": "Pays fictif de dÃ©monstration", "currencyCode": "TND", "currencySymbol": "DT", "isDefault": True},
    {"code": "FR", "name": "France synthÃ©tique", "currencyCode": "EUR", "currencySymbol": "â‚¬", "isDefault": False},
    {"code": "MA", "name": "Maroc synthÃ©tique", "currencyCode": "MAD", "currencySymbol": "DH", "isDefault": False},
    {"code": "AE", "name": "Ã‰mirats synthÃ©tiques", "currencyCode": "AED", "currencySymbol": "Ø¯.Ø¥", "isDefault": False},
]

ENTITY_CONFIG = [
    {"code": "SAFE-DEMO-001", "name": "SAFE DÃ©monstration SynthÃ©tique (fictive)", "countryCode": "ZZ"},
    {"code": "SAFE-FR-001", "name": "SAFE France Distribution (fictive)", "countryCode": "FR"},
    {"code": "SAFE-MA-001", "name": "SAFE Maroc Industrie (fictive)", "countryCode": "MA"},
    {"code": "SAFE-AE-001", "name": "SAFE Ã‰mirats Trading (fictive)", "countryCode": "AE"},
]

ACCOUNT_CATEGORIES = {
    "CASH_EQUIVALENT": {"type": "Asset", "classNumber": 1},
    "TRADE_RECEIVABLE": {"type": "Asset", "classNumber": 1},
    "INVENTORY": {"type": "Asset", "classNumber": 1},
    "OTHER_CURRENT_ASSET": {"type": "Asset", "classNumber": 1},
    "NONCURRENT_ASSET": {"type": "Asset", "classNumber": 2},
    "TRADE_PAYABLE": {"type": "Liability", "classNumber": 4},
    "OTHER_CURRENT_LIABILITY": {"type": "Liability", "classNumber": 4},
    "NONCURRENT_LIABILITY": {"type": "Liability", "classNumber": 4},
    "EQUITY": {"type": "Equity", "classNumber": 1},
    "REVENUE": {"type": "Revenue", "classNumber": 7},
    "OTHER_OPERATING_INCOME": {"type": "Revenue", "classNumber": 7},
    "OTHER_INCOME": {"type": "Revenue", "classNumber": 7},
    "FINANCIAL_INCOME": {"type": "Revenue", "classNumber": 7},
    "EXCEPTIONAL_INCOME": {"type": "Revenue", "classNumber": 7},
    "COST_OF_GOODS_SOLD": {"type": "Expense", "classNumber": 6},
    "PURCHASES": {"type": "Expense", "classNumber": 6},
    "OPERATING_EXPENSE": {"type": "Expense", "classNumber": 6},
    "DEPRECIATION_AMORTIZATION": {"type": "Expense", "classNumber": 6},
    "INTEREST_EXPENSE": {"type": "Expense", "classNumber": 6},
    "INCOME_TAX_EXPENSE": {"type": "Expense", "classNumber": 6},
    "EXCEPTIONAL_EXPENSE": {"type": "Expense", "classNumber": 6},
    "OTHER_EXPENSE": {"type": "Expense", "classNumber": 6},
}


def new_id():
    return str(uuid.uuid4())


def utc_millis(day):
    value = dt.datetime.combine(day, dt.time(12), tzinfo=dt.timezone.utc)
    return int(value.timestamp() * 1000)


def ensure_country(db, config):
    existing = db.execute('SELECT "id" FROM "CountryProfile" WHERE "code"=?', (config["code"],)).fetchone()
    country_id = existing[0] if existing else new_id()
    if not existing:
        db.execute(
            'INSERT INTO "CountryProfile" ("id","code","name","currencyCode","currencySymbol","stampDuty","corporateTax","isDefault","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
            (country_id, config["code"], config["name"], config["currencyCode"], config["currencySymbol"], 1.0, 20.0, int(config["isDefault"])),
        )
    for category, details in ACCOUNT_CATEGORIES.items():
        if not db.execute('SELECT 1 FROM "ChartOfAccount" WHERE "countryId"=? AND "code"=?', (country_id, f"SYN-{category}")).fetchone():
            db.execute(
                'INSERT INTO "ChartOfAccount" ("id","countryId","code","description","classNumber","type","financialCategory","isPostingAllowed","createdAt") VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
                (new_id(), country_id, f"SYN-{category}", f"Compte synthÃ©tique â€” {category}", details["classNumber"], details["type"], category, 1),
            )
    return country_id


def ensure_entity(db, code, name, country_id):
    existing = db.execute('SELECT "id" FROM "Entity" WHERE "code"=?', (code,)).fetchone()
    if existing:
        return existing[0]
    entity_id = new_id()
    db.execute(
        'INSERT INTO "Entity" ("id","code","name","countryId","createdAt") VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
        (entity_id, code, name, country_id),
    )
    return entity_id


def ensure_customer(db, entity_id, code, name):
    existing = db.execute('SELECT "id" FROM "Customer" WHERE "entityId"=? AND "code"=?', (entity_id, code)).fetchone()
    if existing:
        return existing[0]
    customer_id = new_id()
    db.execute(
        'INSERT INTO "Customer" ("id","code","name","entityId","createdAt") VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
        (customer_id, code, name, entity_id),
    )
    return customer_id


def ensure_vendor(db, entity_id, code, name):
    existing = db.execute('SELECT "id" FROM "Vendor" WHERE "entityId"=? AND "code"=?', (entity_id, code)).fetchone()
    if existing:
        return existing[0]
    vendor_id = new_id()
    db.execute(
        'INSERT INTO "Vendor" ("id","code","name","entityId","createdAt") VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
        (vendor_id, code, name, entity_id),
    )
    return vendor_id


def ensure_bank_account(db, entity_id, name, currency_code):
    existing = db.execute('SELECT "id" FROM "BankAccount" WHERE "entityId"=? AND "name"=?', (entity_id, name)).fetchone()
    if existing:
        return existing[0]
    bank_id = new_id()
    db.execute(
        'INSERT INTO "BankAccount" ("id","entityId","name","currencyCode","ledgerAccountCode","isActive","createdAt") VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)',
        (bank_id, entity_id, name, currency_code, 'SYN-CASH_EQUIVALENT', 1),
    )
    return bank_id


def add_entry(db, entity_id, number, day, description, lines, reference=None):
    reference = reference or RUN_MARKER
    if sum(round(debit * 1000) for _, debit, _ in lines) != sum(round(credit * 1000) for _, _, credit in lines):
        raise ValueError(f"Unbalanced synthetic entry: {number}")
    existing = db.execute(
        'SELECT "id" FROM "JournalEntry" WHERE "entryNumber"=? AND "entityId"=? AND "reference"=?',
        (number, entity_id, reference),
    ).fetchone()
    if existing:
        return existing[0]
    entry_id = new_id()
    db.execute(
        'INSERT INTO "JournalEntry" ("id","entryNumber","entityId","date","reference","description","status","postedAt","postedByUsername") VALUES (?,?,?,?,?,?,?, ?,?)',
        (entry_id, number, entity_id, utc_millis(day), reference, description, 'POSTED', utc_millis(day), 'SAFE-DEMO'),
    )
    for code, debit, credit in lines:
        db.execute(
            'INSERT INTO "JournalLine" ("id","journalEntryId","accountCode","debit","credit","description") VALUES (?,?,?,?,?,?)',
            (new_id(), entry_id, f'SYN-{code}', debit, credit, f'{RUN_MARKER} â€” {description}'),
        )
    return entry_id


def add_intercompany_trade(db, seller_entity_id, buyer_entity_id, day, amount, trade_label, reference=None):
    reference = reference or RUN_MARKER
    seller_entry = f'INTERCO-{trade_label}-SELLER'
    buyer_entry = f'INTERCO-{trade_label}-BUYER'
    if not db.execute('SELECT 1 FROM "JournalEntry" WHERE "entryNumber"=? AND "entityId"=? AND "reference"=?', (seller_entry, seller_entity_id, reference)).fetchone():
        add_entry(
            db,
            seller_entity_id,
            seller_entry,
            day,
            f'Vente intercompagnie synthÃ©tique â€” {trade_label}',
            [
                ('TRADE_RECEIVABLE', amount, 0),
                ('REVENUE', 0, amount),
            ],
            reference=reference,
        )
    if not db.execute('SELECT 1 FROM "JournalEntry" WHERE "entryNumber"=? AND "entityId"=? AND "reference"=?', (buyer_entry, buyer_entity_id, reference)).fetchone():
        add_entry(
            db,
            buyer_entity_id,
            buyer_entry,
            day,
            f'Achat intercompagnie synthÃ©tique â€” {trade_label}',
            [
                ('INVENTORY', amount, 0),
                ('TRADE_PAYABLE', 0, amount),
            ],
            reference=reference,
        )


def add_invoice(db, entity_id, customer_id, currency_code, invoice_number, day, subtotal, tax_rate, status='ISSUED'):
    existing = db.execute('SELECT "id" FROM "Invoice" WHERE "entityId"=? AND "invoiceNumber"=?', (entity_id, invoice_number)).fetchone()
    if existing:
        return existing[0]
    journal_id = add_entry(
        db,
        entity_id,
        f'{invoice_number}-JOURNAL',
        day,
        f'Facture synthÃ©tique {invoice_number}',
        [
            ('TRADE_RECEIVABLE', subtotal * (1 + tax_rate / 100), 0),
            ('REVENUE', 0, subtotal),
            ('OTHER_CURRENT_LIABILITY', 0, subtotal * (tax_rate / 100)),
        ],
        reference=RUN_MARKER,
    )
    invoice_id = new_id()
    columns = [
        'id', 'invoiceNumber', 'entityId', 'customerId', 'currencyCode', 'vatAccountCode',
        'subTotal', 'taxAmount', 'stampDuty', 'totalAmount', 'functionalCurrencyCode',
        'dueDate', 'status', 'issuedByUsername', 'issuedAt', 'postingJournalEntryId',
    ]
    values = (
        invoice_id, invoice_number, entity_id, customer_id, currency_code,
        'SYN-OTHER_CURRENT_LIABILITY', subtotal, subtotal * (tax_rate / 100), 0,
        subtotal * (1 + tax_rate / 100), currency_code, utc_millis(day + dt.timedelta(days=30)),
        status, 'SAFE-DEMO', utc_millis(day), journal_id,
    )
    db.execute(
        f'INSERT INTO "Invoice" ({", ".join(f'"{column}"' for column in columns)}) VALUES ({", ".join("?" for _ in values)})',
        values,
    )
    return invoice_id


def add_purchase_invoice(db, entity_id, vendor_id, currency_code, invoice_number, day, subtotal, tax_rate, status='POSTED'):
    existing = db.execute('SELECT "id" FROM "PurchaseInvoice" WHERE "entityId"=? AND "invoiceNumber"=?', (entity_id, invoice_number)).fetchone()
    if existing:
        return existing[0]
    journal_id = add_entry(
        db,
        entity_id,
        f'{invoice_number}-JOURNAL',
        day,
        f'Achat synthÃ©tique {invoice_number}',
        [
            ('INVENTORY', subtotal, 0),
            ('OTHER_CURRENT_ASSET', subtotal * (tax_rate / 100), 0),
            ('TRADE_PAYABLE', 0, subtotal * (1 + tax_rate / 100)),
        ],
        reference=RUN_MARKER,
    )
    invoice_id = new_id()
    columns = [
        'id', 'invoiceNumber', 'entityId', 'vendorId', 'issueDate', 'dueDate', 'currencyCode', 'subTotal',
        'taxRateId', 'taxRateCode', 'taxRate', 'taxAmount', 'totalAmount', 'functionalCurrencyCode',
        'status', 'postedByUsername', 'postedAt', 'postingJournalEntryId', 'updatedAt',
    ]
    values = (
        invoice_id, invoice_number, entity_id, vendor_id, utc_millis(day), utc_millis(day + dt.timedelta(days=35)),
        currency_code, subtotal, 'SYN-TVA-19', 'SYN_TVA_19', tax_rate, subtotal * (tax_rate / 100),
        subtotal * (1 + tax_rate / 100), currency_code, status, 'SAFE-DEMO', utc_millis(day), journal_id, utc_millis(day),
    )
    db.execute(
        f'INSERT INTO "PurchaseInvoice" ({", ".join(f'"{column}"' for column in columns)}) VALUES ({", ".join("?" for _ in values)})',
        values,
    )
    return invoice_id


def ensure_multinational_dataset(db):
    # Ensure base entity remains available as the synthetic demo contract for exports.
    countries = {cfg['code']: ensure_country(db, cfg) for cfg in COUNTRY_CONFIG}
    entities = {}
    for entity_cfg in ENTITY_CONFIG:
        entities[entity_cfg['code']] = ensure_entity(db, entity_cfg['code'], entity_cfg['name'], countries[entity_cfg['countryCode']])

    # Keep the original group synthetic demo accessible to the dashboard export.
    if not db.execute('SELECT 1 FROM "ConsolidationGroup" WHERE "name"=?', ('SAFE Groupe synthÃ©tique',)).fetchone():
        group_id = new_id(); db.execute('INSERT INTO "ConsolidationGroup" ("id","ownerEntityId","name","reportingCurrencyCode","eliminationPolicy","createdAt","updatedAt") VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', (group_id, entities['SAFE-DEMO-001'], 'SAFE Groupe synthÃ©tique', 'TND', 'UNCONFIGURED'))
        for code, entity_id in entities.items():
            membership_id = new_id()
            db.execute('INSERT INTO "ConsolidationGroupEntity" ("id","groupId","entityId","ownershipPercentage","consolidationMethod","createdAt") VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)', (membership_id, group_id, entity_id, 100 if code == 'SAFE-DEMO-001' else 80, 'PROPORTIONAL',))
            for period in ['2026-01', '2026-11']:
                db.execute('INSERT INTO "ConsolidationFxRate" ("id","membershipId","period","rate","rateDate","source","createdAt","updatedAt") VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', (new_id(), membership_id, period, 1.0 if code == 'SAFE-DEMO-001' else 0.27 if code == 'SAFE-FR-001' else 0.36 if code == 'SAFE-MA-001' else 0.31, f"2026-{period[-2:]}-01", 'SYNTHETIC_RATE',))
            db.execute('INSERT INTO "ConsolidationAccountMapping" ("id","membershipId","localAccountCode","groupAccountCode","groupAccountDescription","createdAt") VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)', (new_id(), membership_id, 'SYN-REVENUE', 'REVENUE_GRP', 'Produits consolidÃ©s synthÃ©tiques'))

    for country_code, entity_code in [('ZZ', 'SAFE-DEMO-001'), ('FR', 'SAFE-FR-001'), ('MA', 'SAFE-MA-001'), ('AE', 'SAFE-AE-001')]:
        entity_id = entities[entity_code]
        ensure_bank_account(db, entity_id, f'Banque {country_code} (fictive)', countries[country_code])
        customer_id = ensure_customer(db, entity_id, f'SYN-CUST-{country_code}', f'Client {country_code} synthÃ©tique')
        vendor_id = ensure_vendor(db, entity_id, f'SYN-VEND-{country_code}', f'Fournisseur {country_code} synthÃ©tique')
        for month in range(1, 13):
            day = dt.date(2026, month, 12)
            if month % 2 == 0:
                invoice_number = f'SYN-INV-{country_code}-{month:02d}'
                add_invoice(db, entity_id, customer_id, countries[country_code], invoice_number, day, 1500 + month * 80, 19)
            purchase_invoice_number = f'SYN-PUR-{country_code}-{month:02d}'
            add_purchase_invoice(db, entity_id, vendor_id, countries[country_code], purchase_invoice_number, day, 1200 + month * 60, 19)

            add_entry(
                db,
                entity_id,
                f'SYN-OPS-{country_code}-{month:02d}',
                day,
                f'OpÃ©rations mensuelles synthÃ©tiques {country_code}',
                [
                    ('COST_OF_GOODS_SOLD', 600 + month * 40, 0),
                    ('INVENTORY', 0, 600 + month * 40),
                    ('OPERATING_EXPENSE', 280 + month * 20, 0),
                    ('CASH_EQUIVALENT', 0, 280 + month * 20),
                    ('DEPRECIATION_AMORTIZATION', 70 + month * 8, 0),
                    ('NONCURRENT_ASSET', 0, 70 + month * 8),
                ],
            )

    intercompany_pairs = [
        ('SAFE-DEMO-001', 'SAFE-FR-001', 1, 12000),
        ('SAFE-FR-001', 'SAFE-MA-001', 2, 9800),
        ('SAFE-DEMO-001', 'SAFE-AE-001', 3, 13500),
        ('SAFE-MA-001', 'SAFE-AE-001', 4, 11600),
    ]
    for seller_code, buyer_code, month, amount in intercompany_pairs:
        seller_entity_id = entities[seller_code]
        buyer_entity_id = entities[buyer_code]
        trade_label = f'{seller_code}-{buyer_code}-{month:02d}'
        add_intercompany_trade(
            db,
            seller_entity_id,
            buyer_entity_id,
            dt.date(2026, month, 15),
            amount,
            trade_label,
            reference=RUN_MARKER,
        )

    return {
        'countries': len(COUNTRY_CONFIG),
        'entities': len(ENTITY_CONFIG),
        'invoices': db.execute('SELECT COUNT(*) FROM "Invoice" WHERE "invoiceNumber" LIKE "SYN-%"').fetchone()[0],
        'purchaseInvoices': db.execute('SELECT COUNT(*) FROM "PurchaseInvoice" WHERE "invoiceNumber" LIKE "SYN-%"').fetchone()[0],
        'journalEntries': db.execute('SELECT COUNT(*) FROM "JournalEntry" WHERE "reference"=?', (RUN_MARKER,)).fetchone()[0],
        'intercompanyTrades': len(intercompany_pairs),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        choices=("dashboard-demo-synthetic.db", "mega-demo-synthetic.db"),
        default="dashboard-demo-synthetic.db",
    )
    args = parser.parse_args()
    database_path = (ROOT / "src" / "data" / args.database).resolve()
    expected_database_url = f"file:../{args.database}"
    if (
        os.environ.get("SAFE_ERP_DATABASE_PROVIDER", "sqlite") != "sqlite"
        or os.environ.get("SAFE_ERP_DATABASE_URL") != expected_database_url
        or os.environ.get("SAFE_ERP_DASHBOARD_DEMO_CONFIRM") != "YES"
    ):
        raise SystemExit("RefusÃ© : le script exige la cible SQLite synthÃ©tique explicitement confirmÃ©e.")
    if database_path.parent != DATA_DIR or not database_path.is_file():
        raise SystemExit("Base synthÃ©tique dÃ©diÃ©e introuvable; aucune donnÃ©e Ã©crite.")

    db = sqlite3.connect(database_path)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        result = ensure_multinational_dataset(db)
        db.commit()
        print({"synthetic": True, "database": database_path.name, **result})
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
