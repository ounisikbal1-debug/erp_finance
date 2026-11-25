CREATE TABLE "CountryProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "currencySymbol" TEXT NOT NULL DEFAULT 'DT',
    "stampDuty" REAL NOT NULL DEFAULT 1.0,
    "corporateTax" REAL NOT NULL DEFAULT 20.0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CountryProfile_code_key" ON "CountryProfile"("code");

CREATE TABLE "PayrollConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "employeeCnssRate" REAL NOT NULL DEFAULT 9.68,
    "employerCnssRate" REAL NOT NULL DEFAULT 16.57,
    "employerWorkAccidentRate" REAL NOT NULL DEFAULT 0.50,
    "foprolosRate" REAL NOT NULL DEFAULT 1.00,
    "cssRate" REAL NOT NULL DEFAULT 0.50,
    "profExpensesRate" REAL NOT NULL DEFAULT 10.0,
    "profExpensesMaxCap" REAL NOT NULL DEFAULT 2000.0,
    "headOfFamilyDeduction" REAL NOT NULL DEFAULT 300.0,
    "childDeduction" REAL NOT NULL DEFAULT 100.0,
    "parentDeduction" REAL NOT NULL DEFAULT 450.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollConfig_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PayrollConfig_countryId_key" ON "PayrollConfig"("countryId");

CREATE TABLE "PayrollTaxBracket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "minAmount" REAL NOT NULL,
    "maxAmount" REAL,
    "rate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollTaxBracket_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PayrollTaxBracket_countryId_order_key" ON "PayrollTaxBracket"("countryId", "order");

CREATE TABLE "PayrollRubrique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultAmount" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PayrollRubrique_code_key" ON "PayrollRubrique"("code");

CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "JournalEntry_entityId_entryNumber_key" ON "JournalEntry"("entityId", "entryNumber");

CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalEntryId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0.0,
    "credit" REAL NOT NULL DEFAULT 0.0,
    "description" TEXT,
    "costCenterCode" TEXT,
    CONSTRAINT "JournalLine_journalEntryId_fkey"
        FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostCenter_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CostCenter_entityId_code_key" ON "CostCenter"("entityId", "code");

CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossSalary" REAL NOT NULL,
    "employeeCnss" REAL NOT NULL,
    "employerCnss" REAL NOT NULL,
    "foprolos" REAL NOT NULL,
    "taxableGross" REAL NOT NULL,
    "irpp" REAL NOT NULL,
    "css" REAL NOT NULL,
    "netSalary" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payslip_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vendor_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Vendor_entityId_code_key" ON "Vendor"("entityId", "code");

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "taxRate" REAL NOT NULL DEFAULT 19.0,
    "totalAmount" REAL NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey"
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
