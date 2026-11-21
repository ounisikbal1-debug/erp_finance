CREATE TABLE "PartnerDispute" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "partnerType" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdByUserId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedBy" TEXT,
  "resolutionNote" TEXT,
  CONSTRAINT "PartnerDispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerDispute_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PartnerDispute_entityId_partnerType_partnerId_status_idx"
ON "PartnerDispute"("entityId", "partnerType", "partnerId", "status");
