CREATE TABLE "StockPick" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PICKED',
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "entityId"),
  FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockPick_entityId_reference_key" ON "StockPick"("entityId", "reference");
CREATE UNIQUE INDEX "StockPick_entityId_idempotencyKey_key" ON "StockPick"("entityId", "idempotencyKey");
CREATE INDEX "StockPick_entityId_status_createdAt_idx" ON "StockPick"("entityId", "status", "createdAt");

CREATE TABLE "StockPickLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "pickId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "entityId"),
  FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("pickId", "entityId") REFERENCES "StockPick" ("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StockPickLine_entityId_pickId_idx" ON "StockPickLine"("entityId", "pickId");
CREATE INDEX "StockPickLine_entityId_materialId_warehouseId_idx" ON "StockPickLine"("entityId", "materialId", "warehouseId");

CREATE TABLE "StockDispatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "pickId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedByUserId" TEXT NOT NULL,
  "confirmedByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "entityId"),
  FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("pickId", "entityId") REFERENCES "StockPick" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockDispatch_pickId_entityId_key" ON "StockDispatch"("pickId", "entityId");
CREATE UNIQUE INDEX "StockDispatch_entityId_idempotencyKey_key" ON "StockDispatch"("entityId", "idempotencyKey");
CREATE INDEX "StockDispatch_entityId_confirmedAt_idx" ON "StockDispatch"("entityId", "confirmedAt");
