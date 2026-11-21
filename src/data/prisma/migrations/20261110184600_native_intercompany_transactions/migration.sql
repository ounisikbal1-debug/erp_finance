-- Persist linked seller/buyer entries, FX terms and two-sided reconciliation state.
CREATE TABLE "IntercompanyTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sellerEntityId" TEXT NOT NULL,
  "buyerEntityId" TEXT NOT NULL,
  "transactionDate" DATETIME NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "sellerAmount" REAL NOT NULL,
  "buyerAmount" REAL NOT NULL,
  "exchangeRate" REAL NOT NULL,
  "sellerReceivableAccountCode" TEXT NOT NULL,
  "sellerRevenueAccountCode" TEXT NOT NULL,
  "buyerInventoryAccountCode" TEXT NOT NULL,
  "buyerPayableAccountCode" TEXT NOT NULL,
  "sellerJournalEntryId" TEXT NOT NULL,
  "buyerJournalEntryId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "createdByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" DATETIME,
  "sellerReconciledByUserId" TEXT,
  "sellerReconciledAt" DATETIME,
  "buyerReconciledByUserId" TEXT,
  "buyerReconciledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IntercompanyTransaction_sellerEntityId_fkey"
    FOREIGN KEY ("sellerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IntercompanyTransaction_buyerEntityId_fkey"
    FOREIGN KEY ("buyerEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IntercompanyTransaction_sellerJournalEntryId_fkey"
    FOREIGN KEY ("sellerJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IntercompanyTransaction_buyerJournalEntryId_fkey"
    FOREIGN KEY ("buyerJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntercompanyTransaction_reference_key"
ON "IntercompanyTransaction"("reference");
CREATE UNIQUE INDEX "IntercompanyTransaction_sellerJournalEntryId_key"
ON "IntercompanyTransaction"("sellerJournalEntryId");
CREATE UNIQUE INDEX "IntercompanyTransaction_buyerJournalEntryId_key"
ON "IntercompanyTransaction"("buyerJournalEntryId");
CREATE INDEX "IntercompanyTransaction_sellerEntityId_transactionDate_status_idx"
ON "IntercompanyTransaction"("sellerEntityId", "transactionDate", "status");
CREATE INDEX "IntercompanyTransaction_buyerEntityId_transactionDate_status_idx"
ON "IntercompanyTransaction"("buyerEntityId", "transactionDate", "status");
CREATE INDEX "IntercompanyTransaction_status_transactionDate_idx"
ON "IntercompanyTransaction"("status", "transactionDate");
