ALTER TABLE "ProductionOrder"
ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductionOrder_warehouseId_idx" ON "ProductionOrder"("warehouseId");
