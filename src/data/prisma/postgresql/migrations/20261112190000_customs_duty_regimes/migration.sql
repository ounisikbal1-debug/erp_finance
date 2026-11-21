CREATE TABLE "CustomsDutyRegime" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "regimeType" TEXT NOT NULL,
  "regimeReference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomsDutyRegime_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomsDutyRegime_id_entityId_key" UNIQUE ("id", "entityId"),
  CONSTRAINT "CustomsDutyRegime_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsStockSheet" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "sheetReference" TEXT NOT NULL,
  "tariffCode" TEXT,
  "itemDescription" TEXT NOT NULL,
  "unitCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomsStockSheet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomsStockSheet_id_entityId_key" UNIQUE ("id", "entityId"),
  CONSTRAINT "CustomsStockSheet_regimeId_entityId_fkey"
    FOREIGN KEY ("regimeId", "entityId") REFERENCES "CustomsDutyRegime"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsStockMovement" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "stockSheetId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomsStockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomsStockMovement_stockSheetId_entityId_fkey"
    FOREIGN KEY ("stockSheetId", "entityId") REFERENCES "CustomsStockSheet"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsBond" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "bondReference" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "issuedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releaseReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomsBond_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomsBond_regimeId_entityId_fkey"
    FOREIGN KEY ("regimeId", "entityId") REFERENCES "CustomsDutyRegime"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomsDutyRegime_entityId_regimeReference_key" ON "CustomsDutyRegime"("entityId", "regimeReference");
CREATE INDEX "CustomsDutyRegime_entityId_regimeType_status_startsAt_idx"
  ON "CustomsDutyRegime"("entityId", "regimeType", "status", "startsAt");
CREATE UNIQUE INDEX "CustomsStockSheet_entityId_regimeId_sheetReference_key"
  ON "CustomsStockSheet"("entityId", "regimeId", "sheetReference");
CREATE INDEX "CustomsStockSheet_entityId_regimeId_tariffCode_idx"
  ON "CustomsStockSheet"("entityId", "regimeId", "tariffCode");
CREATE INDEX "CustomsStockMovement_entityId_stockSheetId_occurredAt_idx"
  ON "CustomsStockMovement"("entityId", "stockSheetId", "occurredAt");
CREATE UNIQUE INDEX "CustomsBond_entityId_regimeId_bondReference_key"
  ON "CustomsBond"("entityId", "regimeId", "bondReference");
CREATE INDEX "CustomsBond_entityId_regimeId_status_idx"
  ON "CustomsBond"("entityId", "regimeId", "status");
