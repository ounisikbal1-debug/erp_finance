ALTER TABLE "Invoice" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "createdByUsername" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "approvedByUsername" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "issuedByUserId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "issuedByUsername" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "issuedAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "postingJournalEntryId" TEXT;

CREATE UNIQUE INDEX "Invoice_postingJournalEntryId_key"
ON "Invoice"("postingJournalEntryId");

CREATE TABLE "SalesInvoiceWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesInvoiceWorkflowEvent_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesInvoiceWorkflowEvent_invoiceId_action_key"
ON "SalesInvoiceWorkflowEvent"("invoiceId", "action");

CREATE INDEX "SalesInvoiceWorkflowEvent_invoiceId_createdAt_idx"
ON "SalesInvoiceWorkflowEvent"("invoiceId", "createdAt");
