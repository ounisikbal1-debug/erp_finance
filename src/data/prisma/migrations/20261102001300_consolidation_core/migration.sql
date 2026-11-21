CREATE TABLE "ConsolidationGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerEntityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "reportingCurrencyCode" TEXT NOT NULL,
  "eliminationPolicy" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ConsolidationGroup_ownerEntityId_fkey"
    FOREIGN KEY ("ownerEntityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationGroup_ownerEntityId_name_key"
ON "ConsolidationGroup"("ownerEntityId", "name");
CREATE INDEX "ConsolidationGroup_ownerEntityId_createdAt_idx"
ON "ConsolidationGroup"("ownerEntityId", "createdAt");

CREATE TABLE "ConsolidationGroupEntity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "ownershipPercentage" REAL NOT NULL,
  "consolidationMethod" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidationGroupEntity_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidationGroupEntity_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationGroupEntity_groupId_entityId_key"
ON "ConsolidationGroupEntity"("groupId", "entityId");
CREATE INDEX "ConsolidationGroupEntity_entityId_idx"
ON "ConsolidationGroupEntity"("entityId");

CREATE TABLE "ConsolidationAccountMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "membershipId" TEXT NOT NULL,
  "localAccountCode" TEXT NOT NULL,
  "groupAccountCode" TEXT NOT NULL,
  "groupAccountDescription" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidationAccountMapping_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "ConsolidationGroupEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationAccountMapping_membershipId_localAccountCode_key"
ON "ConsolidationAccountMapping"("membershipId", "localAccountCode");
CREATE INDEX "ConsolidationAccountMapping_membershipId_groupAccountCode_idx"
ON "ConsolidationAccountMapping"("membershipId", "groupAccountCode");

CREATE TABLE "ConsolidationFxRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "membershipId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "rate" REAL NOT NULL,
  "rateDate" DATETIME NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ConsolidationFxRate_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "ConsolidationGroupEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationFxRate_membershipId_period_key"
ON "ConsolidationFxRate"("membershipId", "period");

CREATE TABLE "ConsolidationAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "debitAccountCode" TEXT NOT NULL,
  "creditAccountCode" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" DATETIME,
  CONSTRAINT "ConsolidationAdjustment_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConsolidationAdjustment_groupId_period_status_idx"
ON "ConsolidationAdjustment"("groupId", "period", "status");

CREATE TABLE "ConsolidationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reportingCurrencyCode" TEXT NOT NULL,
  "diagnostics" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidationRun_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConsolidationRun_groupId_period_createdAt_idx"
ON "ConsolidationRun"("groupId", "period", "createdAt");

CREATE TABLE "ConsolidationRunLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "groupAccountCode" TEXT NOT NULL,
  "debit" REAL NOT NULL,
  "credit" REAL NOT NULL,
  "lineType" TEXT NOT NULL,
  CONSTRAINT "ConsolidationRunLine_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "ConsolidationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConsolidationRunLine_runId_groupAccountCode_idx"
ON "ConsolidationRunLine"("runId", "groupAccountCode");
