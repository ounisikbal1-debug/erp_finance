CREATE TABLE "TenderBid" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "tenderReference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contractingAuthority" TEXT NOT NULL,
  "portalReference" TEXT,
  "submissionDeadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'TRACKING',
  "outcomeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenderBid_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenderBid_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenderBid_id_entityId_key" ON "TenderBid"("id", "entityId");

CREATE TABLE "TenderDocument" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "tenderBidId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "reference" TEXT,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenderDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenderDocument_tenderBidId_entityId_fkey"
    FOREIGN KEY ("tenderBidId", "entityId") REFERENCES "TenderBid"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenderCaution" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "tenderBidId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "reference" TEXT,
  "issuedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenderCaution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenderCaution_tenderBidId_entityId_fkey"
    FOREIGN KEY ("tenderBidId", "entityId") REFERENCES "TenderBid"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenderBid_entityId_tenderReference_key" ON "TenderBid"("entityId", "tenderReference");
CREATE INDEX "TenderBid_entityId_status_submissionDeadline_idx"
  ON "TenderBid"("entityId", "status", "submissionDeadline");
CREATE INDEX "TenderBid_entityId_contractingAuthority_outcomeAt_idx"
  ON "TenderBid"("entityId", "contractingAuthority", "outcomeAt");
CREATE INDEX "TenderDocument_entityId_tenderBidId_status_idx"
  ON "TenderDocument"("entityId", "tenderBidId", "status");
CREATE INDEX "TenderCaution_entityId_tenderBidId_status_idx"
  ON "TenderCaution"("entityId", "tenderBidId", "status");
