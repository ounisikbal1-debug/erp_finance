CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "ledgerAccountCode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAccount_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankAccount_entityId_name_key" ON "BankAccount"("entityId", "name");
CREATE INDEX "BankAccount_entityId_isActive_idx" ON "BankAccount"("entityId", "isActive");

CREATE TABLE "BankStatement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "originalFilename" TEXT,
  "lineCount" INTEGER NOT NULL,
  "importedByUserId" TEXT,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankStatement_bankAccountId_sourceHash_key" ON "BankStatement"("bankAccountId", "sourceHash");
CREATE INDEX "BankStatement_entityId_importedAt_idx" ON "BankStatement"("entityId", "importedAt");

CREATE TABLE "BankStatementLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "transactionDate" DATETIME NOT NULL,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "balanceAfter" REAL,
  "currencyCode" TEXT NOT NULL,
  "externalReference" TEXT,
  "deduplicationKey" TEXT NOT NULL,
  CONSTRAINT "BankStatementLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankStatementLine_statementId_rowNumber_key" ON "BankStatementLine"("statementId", "rowNumber");
CREATE UNIQUE INDEX "BankStatementLine_bankAccountId_deduplicationKey_key" ON "BankStatementLine"("bankAccountId", "deduplicationKey");
CREATE INDEX "BankStatementLine_entityId_transactionDate_idx" ON "BankStatementLine"("entityId", "transactionDate");

CREATE TABLE "BankReconciliation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "statementLineId" TEXT NOT NULL,
  "journalLineId" TEXT NOT NULL,
  "reconciledByUserId" TEXT,
  "reconciledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliation_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliation_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliation_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankReconciliation_statementLineId_key" ON "BankReconciliation"("statementLineId");
CREATE UNIQUE INDEX "BankReconciliation_journalLineId_key" ON "BankReconciliation"("journalLineId");
CREATE INDEX "BankReconciliation_entityId_reconciledAt_idx" ON "BankReconciliation"("entityId", "reconciledAt");

CREATE TABLE "CashForecastScenario" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "openingBalance" REAL,
  "openingBalanceDate" DATETIME,
  "openingBalanceSource" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CashForecastScenario_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashForecastScenario_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashForecastScenario_entityId_name_key" ON "CashForecastScenario"("entityId", "name");
CREATE INDEX "CashForecastScenario_entityId_createdAt_idx" ON "CashForecastScenario"("entityId", "createdAt");

CREATE TABLE "CashForecastItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "expectedDate" DATETIME NOT NULL,
  "description" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "category" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashForecastItem_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashForecastItem_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "CashForecastScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CashForecastItem_entityId_scenarioId_expectedDate_idx" ON "CashForecastItem"("entityId", "scenarioId", "expectedDate");
