PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE "__CountryProfile_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "currencySymbol" TEXT NOT NULL DEFAULT 'DT',
    "stampDuty" REAL,
    "corporateTax" REAL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "productionWipAccountCode" TEXT,
    "salesReceivableAccountCode" TEXT,
    "salesRevenueAccountCode" TEXT,
    "salesStampDutyAccountCode" TEXT,
    "salesVatAccountCode" TEXT,
    "stockAdjustmentAccountCode" TEXT,
    "stockAssetAccountCode" TEXT,
    "purchaseExpenseAccountCode" TEXT,
    "purchaseVatAccountCode" TEXT,
    "realizedFxGainAccountCode" TEXT,
    "realizedFxLossAccountCode" TEXT,
    "unrealizedFxGainAccountCode" TEXT,
    "unrealizedFxLossAccountCode" TEXT,
    "productionLaborAccountCode" TEXT,
    "productionOverheadAccountCode" TEXT
);

INSERT INTO "__CountryProfile_new" (
    "id", "code", "name", "currencyCode", "currencySymbol", "stampDuty", "corporateTax",
    "isDefault", "createdAt", "updatedAt", "productionWipAccountCode",
    "salesReceivableAccountCode", "salesRevenueAccountCode", "salesStampDutyAccountCode",
    "salesVatAccountCode", "stockAdjustmentAccountCode", "stockAssetAccountCode",
    "purchaseExpenseAccountCode", "purchaseVatAccountCode", "realizedFxGainAccountCode",
    "realizedFxLossAccountCode", "unrealizedFxGainAccountCode", "unrealizedFxLossAccountCode",
    "productionLaborAccountCode", "productionOverheadAccountCode"
)
SELECT
    "id", "code", "name", "currencyCode", "currencySymbol", "stampDuty", "corporateTax",
    "isDefault", "createdAt", "updatedAt", "productionWipAccountCode",
    "salesReceivableAccountCode", "salesRevenueAccountCode", "salesStampDutyAccountCode",
    "salesVatAccountCode", "stockAdjustmentAccountCode", "stockAssetAccountCode",
    "purchaseExpenseAccountCode", "purchaseVatAccountCode", "realizedFxGainAccountCode",
    "realizedFxLossAccountCode", "unrealizedFxGainAccountCode", "unrealizedFxLossAccountCode",
    "productionLaborAccountCode", "productionOverheadAccountCode"
FROM "CountryProfile";

DROP TABLE "CountryProfile";
ALTER TABLE "__CountryProfile_new" RENAME TO "CountryProfile";
CREATE UNIQUE INDEX "CountryProfile_code_key" ON "CountryProfile"("code");

CREATE TABLE "__Entity_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL DEFAULT 'TN01',
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "tradeRegister" TEXT,
    "countryId" TEXT NOT NULL,
    CONSTRAINT "Entity_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "CountryProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "__Entity_new" ("id", "code", "name", "fiscalId", "tradeRegister", "countryId")
SELECT
    "id",
    'LEGACY-' || "id",
    "name",
    NULL,
    NULL,
    (SELECT "id" FROM "CountryProfile" WHERE "code" = 'TN' LIMIT 1)
FROM "Entity";

DROP TABLE "Entity";
ALTER TABLE "__Entity_new" RENAME TO "Entity";
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");
CREATE UNIQUE INDEX "Entity_name_key" ON "Entity"("name");

INSERT OR IGNORE INTO "JournalEntryAuditChainHead" (
    "entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt"
)
SELECT "id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Entity";

CREATE TRIGGER "Entity_JournalEntryAuditChainHead_insert"
AFTER INSERT ON "Entity"
BEGIN
    INSERT INTO "JournalEntryAuditChainHead" (
        "entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt"
    )
    VALUES (NEW."id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END;

CREATE TABLE "TaxJurisdiction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxJurisdiction_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "CountryProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxJurisdiction_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "TaxJurisdiction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TaxJurisdiction_countryId_kind_code_key"
    ON "TaxJurisdiction"("countryId", "kind", "code");
CREATE INDEX "TaxJurisdiction_countryId_parentId_idx"
    ON "TaxJurisdiction"("countryId", "parentId");

CREATE TABLE "CountryTaxRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jurisdictionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "calculationMethod" TEXT NOT NULL,
    "taxBase" TEXT NOT NULL,
    "currencyCode" TEXT,
    "filingPeriod" TEXT,
    "roundingScale" INTEGER NOT NULL DEFAULT 2,
    "roundingMethod" TEXT NOT NULL DEFAULT 'HALF_UP',
    "applicationOrder" INTEGER NOT NULL DEFAULT 0,
    "isCumulative" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appliesToJson" TEXT,
    "conditionsJson" TEXT,
    "formula" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourceReference" TEXT,
    "sourceRetrievedAt" DATETIME,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "approvalNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CountryTaxRule_jurisdictionId_fkey"
        FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryTaxRule_jurisdictionId_code_version_key"
    ON "CountryTaxRule"("jurisdictionId", "code", "version");
CREATE INDEX "CountryTaxRule_jurisdictionId_taxType_status_effectiveFrom_idx"
    ON "CountryTaxRule"("jurisdictionId", "taxType", "status", "effectiveFrom");
CREATE INDEX "CountryTaxRule_status_effectiveFrom_effectiveTo_idx"
    ON "CountryTaxRule"("status", "effectiveFrom", "effectiveTo");

CREATE TABLE "CountryTaxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "rateValue" REAL,
    "lowerBound" REAL,
    "upperBound" REAL,
    "lowerBoundInclusive" BOOLEAN NOT NULL DEFAULT true,
    "upperBoundInclusive" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL,
    "currencyCode" TEXT,
    "conditionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryTaxRate_ruleId_fkey"
        FOREIGN KEY ("ruleId") REFERENCES "CountryTaxRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryTaxRate_ruleId_sequence_key"
    ON "CountryTaxRate"("ruleId", "sequence");
CREATE INDEX "CountryTaxRate_ruleId_code_idx"
    ON "CountryTaxRate"("ruleId", "code");

CREATE TABLE "CountryTaxThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "comparator" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "upperAmount" REAL,
    "unit" TEXT NOT NULL,
    "currencyCode" TEXT,
    "period" TEXT,
    "conditionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryTaxThreshold_ruleId_fkey"
        FOREIGN KEY ("ruleId") REFERENCES "CountryTaxRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryTaxThreshold_ruleId_code_key"
    ON "CountryTaxThreshold"("ruleId", "code");
CREATE INDEX "CountryTaxThreshold_ruleId_comparator_idx"
    ON "CountryTaxThreshold"("ruleId", "comparator");

COMMIT;
PRAGMA foreign_keys = ON;
