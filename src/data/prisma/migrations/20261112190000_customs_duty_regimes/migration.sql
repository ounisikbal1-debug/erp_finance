CREATE TABLE "CustomsDutyRegime" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "regimeType" TEXT NOT NULL,
  "regimeReference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" DATETIME,
  "endsAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reference" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomsDutyRegime_id_entityId_key" UNIQUE ("id", "entityId"),
  CONSTRAINT "CustomsDutyRegime_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsStockSheet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "sheetReference" TEXT NOT NULL,
  "tariffCode" TEXT,
  "itemDescription" TEXT NOT NULL,
  "unitCode" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomsStockSheet_id_entityId_key" UNIQUE ("id", "entityId"),
  CONSTRAINT "CustomsStockSheet_regimeId_entityId_fkey"
    FOREIGN KEY ("regimeId", "entityId") REFERENCES "CustomsDutyRegime"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsStockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "stockSheetId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomsStockMovement_stockSheetId_entityId_fkey"
    FOREIGN KEY ("stockSheetId", "entityId") REFERENCES "CustomsStockSheet"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomsBond" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "bondReference" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "issuedAt" DATETIME,
  "releasedAt" DATETIME,
  "releaseReference" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
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
