ALTER TABLE "Material" ADD COLUMN "barcode" TEXT;
ALTER TABLE "Material" ADD COLUMN "unitCode" TEXT NOT NULL DEFAULT 'EA';
ALTER TABLE "Material" ADD COLUMN "minimumStock" INTEGER;

CREATE UNIQUE INDEX "Material_entityId_barcode_key"
ON "Material"("entityId", "barcode");
CREATE UNIQUE INDEX "Material_id_entityId_key"
ON "Material"("id", "entityId");
CREATE INDEX "Material_entityId_minimumStock_idx"
ON "Material"("entityId", "minimumStock");

CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Warehouse_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Warehouse_entityId_code_key"
ON "Warehouse"("entityId", "code");
CREATE UNIQUE INDEX "Warehouse_id_entityId_key"
ON "Warehouse"("id", "entityId");
CREATE INDEX "Warehouse_entityId_name_idx"
ON "Warehouse"("entityId", "name");

CREATE TABLE "MaterialWarehouseStock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MaterialWarehouseStock_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialWarehouseStock_materialId_fkey"
    FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialWarehouseStock_warehouseId_fkey"
    FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MaterialWarehouseStock_materialId_warehouseId_key"
ON "MaterialWarehouseStock"("materialId", "warehouseId");
CREATE INDEX "MaterialWarehouseStock_entityId_materialId_idx"
ON "MaterialWarehouseStock"("entityId", "materialId");
CREATE INDEX "MaterialWarehouseStock_entityId_warehouseId_idx"
ON "MaterialWarehouseStock"("entityId", "warehouseId");

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "sourceWarehouseId" TEXT,
  "destinationWarehouseId" TEXT,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransfer_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_materialId_fkey"
    FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_sourceWarehouseId_fkey"
    FOREIGN KEY ("sourceWarehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_destinationWarehouseId_fkey"
    FOREIGN KEY ("destinationWarehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_hasWarehouse_check"
    CHECK ("sourceWarehouseId" IS NOT NULL OR "destinationWarehouseId" IS NOT NULL)
);
CREATE UNIQUE INDEX "StockTransfer_entityId_idempotencyKey_key"
ON "StockTransfer"("entityId", "idempotencyKey");
CREATE UNIQUE INDEX "StockTransfer_id_entityId_key"
ON "StockTransfer"("id", "entityId");
CREATE INDEX "StockTransfer_entityId_materialId_createdAt_idx"
ON "StockTransfer"("entityId", "materialId", "createdAt");

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "transferId" TEXT,
  "movementType" TEXT NOT NULL,
  "deltaQuantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_materialId_fkey"
    FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_warehouseId_fkey"
    FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_transferId_fkey"
    FOREIGN KEY ("transferId", "entityId") REFERENCES "StockTransfer" ("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StockMovement_entityId_materialId_createdAt_idx"
ON "StockMovement"("entityId", "materialId", "createdAt");
CREATE INDEX "StockMovement_entityId_warehouseId_createdAt_idx"
ON "StockMovement"("entityId", "warehouseId", "createdAt");
