CREATE TABLE "ConsolidationEliminationConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "confirmedByUserId" TEXT NOT NULL,
  "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidationEliminationConfirmation_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationEliminationConfirmation_groupId_period_key"
ON "ConsolidationEliminationConfirmation"("groupId", "period");
