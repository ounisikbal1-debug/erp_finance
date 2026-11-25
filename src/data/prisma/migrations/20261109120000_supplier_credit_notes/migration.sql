CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "sourceInvoiceLineId" TEXT NOT NULL,
    "sourceReturnId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "supplierDocumentNumber" TEXT,
    "creditDate" DATETIME,
    "currencyCode" TEXT NOT NULL,
    "functionalCurrencyCode" TEXT NOT NULL,
    "documentSubTotal" REAL NOT NULL,
    "documentTaxAmount" REAL NOT NULL,
    "documentTotalAmount" REAL NOT NULL,
    "subTotal" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "taxRateCode" TEXT NOT NULL,
    "taxRate" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "exchangeRateDate" DATETIME,
    "exchangeRateSource" TEXT,
    "exchangeRateImportedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SUPPLIER_DOCUMENT',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" DATETIME,
    "postedByUserId" TEXT,
    "postedByUsername" TEXT,
    "postedAt" DATETIME,
    "postingJournalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierCreditNote_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNote_vendorId_fkey"
      FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNote_sourceInvoiceId_entityId_fkey"
      FOREIGN KEY ("sourceInvoiceId", "entityId") REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNote_sourceInvoiceLineId_sourceInvoiceId_entityId_fkey"
      FOREIGN KEY ("sourceInvoiceLineId", "sourceInvoiceId", "entityId") REFERENCES "PurchaseInvoiceLine"("id", "purchaseInvoiceId", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNote_sourceReturnId_entityId_fkey"
      FOREIGN KEY ("sourceReturnId", "entityId") REFERENCES "StockSupplierReturn"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNote_postingJournalEntryId_fkey"
      FOREIGN KEY ("postingJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SupplierCreditNote_entityId_supplierDocumentNumber_key"
ON "SupplierCreditNote"("entityId", "supplierDocumentNumber");
CREATE UNIQUE INDEX "SupplierCreditNote_id_entityId_key"
ON "SupplierCreditNote"("id", "entityId");
CREATE UNIQUE INDEX "SupplierCreditNote_sourceReturnId_key"
ON "SupplierCreditNote"("sourceReturnId");
CREATE UNIQUE INDEX "SupplierCreditNote_sourceReturnId_entityId_key"
ON "SupplierCreditNote"("sourceReturnId", "entityId");
CREATE UNIQUE INDEX "SupplierCreditNote_postingJournalEntryId_key"
ON "SupplierCreditNote"("postingJournalEntryId");
CREATE INDEX "SupplierCreditNote_entityId_status_createdAt_idx"
ON "SupplierCreditNote"("entityId", "status", "createdAt");
CREATE INDEX "SupplierCreditNote_entityId_sourceInvoiceId_idx"
ON "SupplierCreditNote"("entityId", "sourceInvoiceId");

CREATE TABLE "SupplierCreditNoteWorkflowEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierCreditNoteId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_fkey"
      FOREIGN KEY ("supplierCreditNoteId") REFERENCES "SupplierCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_action_idx"
ON "SupplierCreditNoteWorkflowEvent"("supplierCreditNoteId", "action");
CREATE INDEX "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_createdAt_idx"
ON "SupplierCreditNoteWorkflowEvent"("supplierCreditNoteId", "createdAt");
