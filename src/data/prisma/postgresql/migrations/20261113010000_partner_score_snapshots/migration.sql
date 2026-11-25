CREATE TABLE "PartnerScoreSnapshot" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "scoreType" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "alertThreshold" DOUBLE PRECISION NOT NULL,
  "alertTriggered" BOOLEAN NOT NULL,
  "metricsJson" TEXT NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerScoreSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerScoreSnapshot_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PartnerScoreSnapshot_entityId_scoreType_partnerId_calculatedAt_idx"
ON "PartnerScoreSnapshot"("entityId", "scoreType", "partnerId", "calculatedAt");
