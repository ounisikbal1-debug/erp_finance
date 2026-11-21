ALTER TABLE "CountryProfile" ADD COLUMN "productionLaborAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "productionOverheadAccountCode" TEXT;

ALTER TABLE "ProductionOrder" ADD COLUMN "laborCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrder" ADD COLUMN "overheadCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrder" ADD COLUMN "scrapQuantity" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrder" ADD COLUMN "scrapReason" TEXT;

ALTER TABLE "ProductionOrderMaterialLine"
ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductionOrderMaterialLine_warehouseId_idx"
ON "ProductionOrderMaterialLine"("warehouseId");
