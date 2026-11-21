-- AlterTable
ALTER TABLE "CountryProfile" ADD COLUMN "productionWipAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "salesReceivableAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "salesRevenueAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "salesStampDutyAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "salesVatAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "stockAdjustmentAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "stockAssetAccountCode" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "currencyCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "documentCurrencyCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "documentStampDuty" REAL;
ALTER TABLE "Invoice" ADD COLUMN "documentSubTotal" REAL;
ALTER TABLE "Invoice" ADD COLUMN "documentTaxAmount" REAL;
ALTER TABLE "Invoice" ADD COLUMN "documentTotalAmount" REAL;
ALTER TABLE "Invoice" ADD COLUMN "exchangeRate" REAL;
ALTER TABLE "Invoice" ADD COLUMN "exchangeRateDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "exchangeRateImportedAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "exchangeRateSource" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "functionalCurrencyCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "vatAccountCode" TEXT;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "sourceUnit" REAL NOT NULL,
    "sourceValue" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CountryPayrollRubrique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultAmount" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryPayrollRubrique_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountryRegulatoryRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "configType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reviewer" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "approvedBy" TEXT,
    "approvalNote" TEXT,
    "approvedAt" DATETIME,
    "periodClosedAt" DATETIME,
    "periodClosedBy" TEXT,
    "periodClosureNote" TEXT,
    "retroactiveConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryRegulatoryRevision_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT,
    "outputMaterialId" TEXT NOT NULL,
    "outputQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrder_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_outputMaterialId_fkey" FOREIGN KEY ("outputMaterialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionOrderMaterialLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "ProductionOrderMaterialLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderMaterialLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subTotal" REAL NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "taxRateCode" TEXT NOT NULL,
    "taxRate" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "documentCurrencyCode" TEXT,
    "documentSubTotal" REAL,
    "documentTaxAmount" REAL,
    "documentTotalAmount" REAL,
    "functionalCurrencyCode" TEXT,
    "exchangeRate" REAL,
    "exchangeRateDate" DATETIME,
    "exchangeRateSource" TEXT,
    "exchangeRateImportedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseInvoice_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveDate_idx" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_sourceName_baseCurrency_quoteCurrency_rateType_effectiveDate_key" ON "ExchangeRate"("sourceName", "baseCurrency", "quoteCurrency", "rateType", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPayrollRubrique_countryId_code_key" ON "CountryPayrollRubrique"("countryId", "code");

-- CreateIndex
CREATE INDEX "CountryRegulatoryRevision_countryId_configType_effectiveFrom_idx" ON "CountryRegulatoryRevision"("countryId", "configType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CountryRegulatoryRevision_countryId_configType_version_key" ON "CountryRegulatoryRevision"("countryId", "configType", "version");

-- CreateIndex
CREATE INDEX "ProductionOrder_entityId_status_createdAt_idx" ON "ProductionOrder"("entityId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_entityId_orderNumber_key" ON "ProductionOrder"("entityId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderMaterialLine_orderId_materialId_key" ON "ProductionOrderMaterialLine"("orderId", "materialId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_entityId_status_issueDate_idx" ON "PurchaseInvoice"("entityId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_entityId_invoiceNumber_key" ON "PurchaseInvoice"("entityId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_employeeId_period_key" ON "Payslip"("employeeId", "period");
