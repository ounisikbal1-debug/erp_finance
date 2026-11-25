ALTER TABLE "ChartOfAccount"
ADD COLUMN "parentId" TEXT REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChartOfAccount"
ADD COLUMN "isPostingAllowed" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "ChartOfAccount_countryId_parentId_idx"
ON "ChartOfAccount"("countryId", "parentId");
