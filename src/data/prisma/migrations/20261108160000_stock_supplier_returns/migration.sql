ALTER TABLE "StockReceipt"
ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StockSupplierReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceReceiptId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockSupplierReturn_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockSupplierReturn_sourceReceiptId_entityId_fkey"
      FOREIGN KEY ("sourceReceiptId", "entityId") REFERENCES "StockReceipt"("id", "entityId")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockSupplierReturn_materialId_entityId_fkey"
      FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockSupplierReturn_warehouseId_entityId_fkey"
      FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockSupplierReturn_entityId_idempotencyKey_key"
ON "StockSupplierReturn"("entityId", "idempotencyKey");

CREATE UNIQUE INDEX "StockSupplierReturn_id_entityId_key"
ON "StockSupplierReturn"("id", "entityId");

CREATE INDEX "StockSupplierReturn_entityId_sourceReceiptId_createdAt_idx"
ON "StockSupplierReturn"("entityId", "sourceReceiptId", "createdAt");

CREATE INDEX "StockSupplierReturn_entityId_warehouseId_createdAt_idx"
ON "StockSupplierReturn"("entityId", "warehouseId", "createdAt");
