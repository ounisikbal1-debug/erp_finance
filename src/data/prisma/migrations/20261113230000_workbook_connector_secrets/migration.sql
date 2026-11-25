CREATE TABLE "WorkbookConnectorSecret" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "fieldNamesJson" TEXT NOT NULL DEFAULT '[]',
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedByUserId" TEXT NOT NULL,
  "updatedByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkbookConnectorSecret_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkbookConnectorSecret_entityId_featureKey_key"
ON "WorkbookConnectorSecret"("entityId", "featureKey");

CREATE INDEX "WorkbookConnectorSecret_entityId_updatedAt_idx"
ON "WorkbookConnectorSecret"("entityId", "updatedAt");
