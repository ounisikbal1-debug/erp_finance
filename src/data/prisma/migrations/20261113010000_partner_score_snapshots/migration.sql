CREATE TABLE "PartnerScoreSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "scoreType" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "score" REAL NOT NULL,
  "alertThreshold" REAL NOT NULL,
  "alertTriggered" BOOLEAN NOT NULL,
  "metricsJson" TEXT NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerScoreSnapshot_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PartnerScoreSnapshot_entityId_scoreType_partnerId_calculatedAt_idx"
ON "PartnerScoreSnapshot"("entityId", "scoreType", "partnerId", "calculatedAt");
