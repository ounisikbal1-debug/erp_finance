CREATE TABLE "TaxDeclarationWorkpaper" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "taxableBase" DOUBLE PRECISION,
    "taxRateSnapshot" DOUBLE PRECISION,
    "certificateCount" INTEGER,
    "sourceReference" TEXT NOT NULL,
    "reviewNote" TEXT NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "approvedByUsername" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxDeclarationWorkpaper_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaxDeclarationWorkpaper_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
      DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX "TaxDeclarationWorkpaper_entityId_period_section_version_key"
  ON "TaxDeclarationWorkpaper"("entityId", "period", "section", "version");
CREATE INDEX "TaxDeclarationWorkpaper_entityId_period_section_isCurrent_idx"
  ON "TaxDeclarationWorkpaper"("entityId", "period", "section", "isCurrent");
