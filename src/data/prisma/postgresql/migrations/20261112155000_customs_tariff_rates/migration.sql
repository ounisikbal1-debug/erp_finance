CREATE TABLE "CustomsTariffRate" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "tariffCode" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "originCountryCode" TEXT,
  "preferentialAgreementCode" TEXT,
  "customsDutyRate" DOUBLE PRECISION NOT NULL,
  "consumptionDutyRate" DOUBLE PRECISION NOT NULL,
  "fodecRate" DOUBLE PRECISION NOT NULL,
  "importVatRate" DOUBLE PRECISION NOT NULL,
  "customsServiceFeeRate" DOUBLE PRECISION NOT NULL,
  "preferentialCustomsDutyRate" DOUBLE PRECISION,
  "customsDutyBaseComponents" TEXT NOT NULL,
  "consumptionDutyBaseComponents" TEXT NOT NULL,
  "fodecBaseComponents" TEXT NOT NULL,
  "importVatBaseComponents" TEXT NOT NULL,
  "customsServiceFeeBaseComponents" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "sourceReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "verifiedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomsTariffRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomsTariffRate_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "customs_tariff_country_code_status_valid_idx"
  ON "CustomsTariffRate"("countryId", "tariffCode", "status", "effectiveFrom");
CREATE INDEX "customs_tariff_country_origin_agreement_idx"
  ON "CustomsTariffRate"("countryId", "tariffCode", "originCountryCode", "preferentialAgreementCode");
