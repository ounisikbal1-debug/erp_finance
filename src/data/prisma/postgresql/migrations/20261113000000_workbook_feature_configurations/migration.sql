CREATE TABLE "WorkbookFeatureConfiguration" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "configurationJson" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sourceReference" TEXT,
  "confirmationNote" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkbookFeatureConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkbookFeatureConfiguration_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkbookFeatureConfiguration_entityId_featureKey_key"
ON "WorkbookFeatureConfiguration"("entityId", "featureKey");

CREATE INDEX "WorkbookFeatureConfiguration_entityId_enabled_idx"
ON "WorkbookFeatureConfiguration"("entityId", "enabled");
