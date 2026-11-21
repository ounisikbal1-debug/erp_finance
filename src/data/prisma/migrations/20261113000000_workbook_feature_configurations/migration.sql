CREATE TABLE "WorkbookFeatureConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "configurationJson" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sourceReference" TEXT,
  "confirmationNote" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkbookFeatureConfiguration_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkbookFeatureConfiguration_entityId_featureKey_key"
ON "WorkbookFeatureConfiguration"("entityId", "featureKey");

CREATE INDEX "WorkbookFeatureConfiguration_entityId_enabled_idx"
ON "WorkbookFeatureConfiguration"("entityId", "enabled");
