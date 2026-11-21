ALTER TABLE "CountryProfile" ADD COLUMN "purchaseExpenseAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "purchaseVatAccountCode" TEXT;

ALTER TABLE "TaxRate" ADD COLUMN "purchaseVatRecoverable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PurchaseInvoice" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "createdByUsername" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "approvedByUsername" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "postedByUserId" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "postedByUsername" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "postedAt" DATETIME;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "postingJournalEntryId" TEXT;

CREATE UNIQUE INDEX "PurchaseInvoice_postingJournalEntryId_key"
ON "PurchaseInvoice"("postingJournalEntryId");

CREATE TABLE "PurchaseInvoiceWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseInvoiceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_action_key"
ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "action");

CREATE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_createdAt_idx"
ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "createdAt");
