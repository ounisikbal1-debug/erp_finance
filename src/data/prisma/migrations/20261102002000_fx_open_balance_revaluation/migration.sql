ALTER TABLE "CountryProfile" ADD COLUMN "unrealizedFxGainAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "unrealizedFxLossAccountCode" TEXT;

CREATE TABLE "FxRevaluationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "reversalDate" DATETIME NOT NULL,
    "functionalCurrencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "revaluationJournalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "createdByUserId" TEXT,
    "createdByUsername" TEXT,
    "reversalProcessedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRevaluationRun_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluationRun_revaluationJournalEntryId_fkey" FOREIGN KEY ("revaluationJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluationRun_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FxRevaluationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "purchaseInvoiceId" TEXT,
    "direction" TEXT NOT NULL,
    "documentCurrencyCode" TEXT NOT NULL,
    "openDocumentAmount" REAL NOT NULL,
    "oldCarryingAmount" REAL NOT NULL,
    "revaluedCarryingAmount" REAL NOT NULL,
    "adjustmentAmount" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "exchangeRateEffectiveDate" DATETIME NOT NULL,
    "exchangeRateSource" TEXT NOT NULL,
    "exchangeRateSourceUrl" TEXT,
    "exchangeRateImportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRevaluationItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FxRevaluationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluationItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluationItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FxRevaluationRun_entityId_effectiveDate_key" ON "FxRevaluationRun"("entityId", "effectiveDate");
CREATE UNIQUE INDEX "FxRevaluationRun_revaluationJournalEntryId_key" ON "FxRevaluationRun"("revaluationJournalEntryId");
CREATE UNIQUE INDEX "FxRevaluationRun_reversalJournalEntryId_key" ON "FxRevaluationRun"("reversalJournalEntryId");
CREATE INDEX "FxRevaluationRun_entityId_status_reversalDate_idx" ON "FxRevaluationRun"("entityId", "status", "reversalDate");
CREATE UNIQUE INDEX "FxRevaluationItem_runId_invoiceId_key" ON "FxRevaluationItem"("runId", "invoiceId");
CREATE UNIQUE INDEX "FxRevaluationItem_runId_purchaseInvoiceId_key" ON "FxRevaluationItem"("runId", "purchaseInvoiceId");
CREATE INDEX "FxRevaluationItem_invoiceId_idx" ON "FxRevaluationItem"("invoiceId");
CREATE INDEX "FxRevaluationItem_purchaseInvoiceId_idx" ON "FxRevaluationItem"("purchaseInvoiceId");
