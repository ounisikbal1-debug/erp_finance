CREATE TABLE "CustomsTariffRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "countryId" TEXT NOT NULL,
  "tariffCode" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "originCountryCode" TEXT,
  "preferentialAgreementCode" TEXT,
  "customsDutyRate" REAL NOT NULL,
  "consumptionDutyRate" REAL NOT NULL,
  "fodecRate" REAL NOT NULL,
  "importVatRate" REAL NOT NULL,
  "customsServiceFeeRate" REAL NOT NULL,
  "preferentialCustomsDutyRate" REAL,
  "customsDutyBaseComponents" TEXT NOT NULL,
  "consumptionDutyBaseComponents" TEXT NOT NULL,
  "fodecBaseComponents" TEXT NOT NULL,
  "importVatBaseComponents" TEXT NOT NULL,
  "customsServiceFeeBaseComponents" TEXT NOT NULL,
  "effectiveFrom" DATETIME NOT NULL,
  "effectiveTo" DATETIME,
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "sourceReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "verifiedAt" DATETIME,
  "verifiedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomsTariffRate_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "customs_tariff_country_code_status_valid_idx"
  ON "CustomsTariffRate"("countryId", "tariffCode", "status", "effectiveFrom");
CREATE INDEX "customs_tariff_country_origin_agreement_idx"
  ON "CustomsTariffRate"("countryId", "tariffCode", "originCountryCode", "preferentialAgreementCode");
