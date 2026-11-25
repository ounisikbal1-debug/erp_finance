-- Persist replay-safe applications of an excess supplier credit to another payable.
CREATE TABLE "SupplierCreditNoteApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "supplierCreditNoteId" TEXT NOT NULL,
    "targetPurchaseInvoiceId" TEXT NOT NULL,
    "documentAmount" REAL NOT NULL,
    "functionalAmount" REAL NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierCreditNoteApplication_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNoteApplication_supplierCreditNoteId_entityId_fkey"
      FOREIGN KEY ("supplierCreditNoteId", "entityId")
      REFERENCES "SupplierCreditNote"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierCreditNoteApplication_targetPurchaseInvoiceId_entityId_fkey"
      FOREIGN KEY ("targetPurchaseInvoiceId", "entityId")
      REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SupplierCreditNoteApplication_entityId_idempotencyKey_key"
ON "SupplierCreditNoteApplication"("entityId", "idempotencyKey");
CREATE UNIQUE INDEX "SupplierCreditNoteApplication_id_entityId_key"
ON "SupplierCreditNoteApplication"("id", "entityId");
CREATE INDEX "SupplierCreditNoteApplication_entityId_supplierCreditNoteId_createdAt_idx"
ON "SupplierCreditNoteApplication"("entityId", "supplierCreditNoteId", "createdAt");
CREATE INDEX "SupplierCreditNoteApplication_entityId_targetPurchaseInvoiceId_createdAt_idx"
ON "SupplierCreditNoteApplication"("entityId", "targetPurchaseInvoiceId", "createdAt");
