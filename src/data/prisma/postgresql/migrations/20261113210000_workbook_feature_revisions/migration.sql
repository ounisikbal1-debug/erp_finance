CREATE TABLE "WorkbookFeatureConfigurationRevision" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "configurationJson" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "sourceReference" TEXT,
  "confirmationNote" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkbookFeatureConfigurationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkbookFeatureConfigurationRevision_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkbookFeatureConfigurationRevision_entityId_featureKey_version_key"
ON "WorkbookFeatureConfigurationRevision"("entityId", "featureKey", "version");

CREATE INDEX "WorkbookFeatureConfigurationRevision_entityId_featureKey_createdAt_idx"
ON "WorkbookFeatureConfigurationRevision"("entityId", "featureKey", "createdAt");
