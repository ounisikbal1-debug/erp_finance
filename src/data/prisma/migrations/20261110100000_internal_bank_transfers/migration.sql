CREATE TABLE "BankTransfer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "sourceBankAccountId" TEXT NOT NULL,
  "destinationBankAccountId" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "transferredAt" DATETIME NOT NULL,
  "reference" TEXT,
  "description" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "postingJournalEntryId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransfer_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankTransfer_sourceBankAccountId_fkey" FOREIGN KEY ("sourceBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankTransfer_destinationBankAccountId_fkey" FOREIGN KEY ("destinationBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankTransfer_postingJournalEntryId_fkey" FOREIGN KEY ("postingJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankTransfer_entityId_idempotencyKey_key"
ON "BankTransfer"("entityId", "idempotencyKey");

CREATE UNIQUE INDEX "BankTransfer_postingJournalEntryId_key"
ON "BankTransfer"("postingJournalEntryId");

CREATE INDEX "BankTransfer_entityId_transferredAt_idx"
ON "BankTransfer"("entityId", "transferredAt");

CREATE INDEX "BankTransfer_sourceBankAccountId_transferredAt_idx"
ON "BankTransfer"("sourceBankAccountId", "transferredAt");

CREATE INDEX "BankTransfer_destinationBankAccountId_transferredAt_idx"
ON "BankTransfer"("destinationBankAccountId", "transferredAt");
