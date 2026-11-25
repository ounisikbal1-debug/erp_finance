ALTER TABLE "BudgetLine" ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BudgetLine" ADD COLUMN "supersedesLineId" TEXT;
ALTER TABLE "BudgetLine" ADD COLUMN "revisionReason" TEXT;

DROP INDEX IF EXISTS "BudgetLine_entityId_period_accountCode_key";
CREATE UNIQUE INDEX "BudgetLine_entityId_period_accountCode_revisionNumber_key"
ON "BudgetLine"("entityId", "period", "accountCode", "revisionNumber");
