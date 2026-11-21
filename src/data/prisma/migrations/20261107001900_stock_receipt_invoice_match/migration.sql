CREATE UNIQUE INDEX "PurchaseInvoice_id_entityId_key" ON "PurchaseInvoice"("id", "entityId");

CREATE TABLE "StockReceipt_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockReceipt_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReceipt_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockReceipt_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockReceipt_purchaseInvoiceId_entityId_fkey" FOREIGN KEY ("purchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoice" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "StockReceipt_new" (
    "id", "entityId", "materialId", "purchaseInvoiceId", "warehouseId", "quantity",
    "unitCost", "reason", "idempotencyKey", "createdByUserId", "createdByUsername", "createdAt"
)
SELECT
    "id", "entityId", "materialId", NULL, "warehouseId", "quantity",
    "unitCost", "reason", "idempotencyKey", "createdByUserId", "createdByUsername", "createdAt"
FROM "StockReceipt";

DROP TABLE "StockReceipt";
ALTER TABLE "StockReceipt_new" RENAME TO "StockReceipt";

CREATE UNIQUE INDEX "StockReceipt_entityId_idempotencyKey_key" ON "StockReceipt"("entityId", "idempotencyKey");
CREATE UNIQUE INDEX "StockReceipt_id_entityId_key" ON "StockReceipt"("id", "entityId");
CREATE INDEX "StockReceipt_entityId_materialId_createdAt_idx" ON "StockReceipt"("entityId", "materialId", "createdAt");
CREATE INDEX "StockReceipt_entityId_warehouseId_createdAt_idx" ON "StockReceipt"("entityId", "warehouseId", "createdAt");
CREATE INDEX "StockReceipt_entityId_purchaseInvoiceId_createdAt_idx" ON "StockReceipt"("entityId", "purchaseInvoiceId", "createdAt");
