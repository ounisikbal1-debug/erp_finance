CREATE TABLE "CashflowAccountingMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "receivableAccountCode" TEXT,
  "payableAccountCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CashflowAccountingMapping_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashflowAccountingMapping_entityId_key"
ON "CashflowAccountingMapping"("entityId");

CREATE TABLE "CashflowPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "statementLineId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "purchaseInvoiceId" TEXT,
  "direction" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "paidAt" DATETIME NOT NULL,
  "recordedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashflowPayment_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashflowPayment_statementLineId_fkey"
    FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashflowPayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashflowPayment_purchaseInvoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashflowPayment_statementLineId_key"
ON "CashflowPayment"("statementLineId");
CREATE INDEX "CashflowPayment_entityId_invoiceId_idx"
ON "CashflowPayment"("entityId", "invoiceId");
CREATE INDEX "CashflowPayment_entityId_purchaseInvoiceId_idx"
ON "CashflowPayment"("entityId", "purchaseInvoiceId");
CREATE INDEX "CashflowPayment_entityId_paidAt_idx"
ON "CashflowPayment"("entityId", "paidAt");
