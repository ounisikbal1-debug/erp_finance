ALTER TABLE "Material" ADD COLUMN "reservedQuantity" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MaterialWarehouseStock" ADD COLUMN "reservedQuantity" REAL NOT NULL DEFAULT 0;

UPDATE "Material"
SET "reservedQuantity" = ROUND(COALESCE((
  SELECT SUM("StockPickLine"."quantity")
  FROM "StockPickLine"
  INNER JOIN "StockPick" ON "StockPick"."id" = "StockPickLine"."pickId"
    AND "StockPick"."entityId" = "StockPickLine"."entityId"
  WHERE "StockPick"."status" = 'PICKED'
    AND "StockPickLine"."materialId" = "Material"."id"
    AND "StockPickLine"."entityId" = "Material"."entityId"
), 0) * 1000) / 1000;

UPDATE "MaterialWarehouseStock"
SET "reservedQuantity" = ROUND(COALESCE((
  SELECT SUM("StockPickLine"."quantity")
  FROM "StockPickLine"
  INNER JOIN "StockPick" ON "StockPick"."id" = "StockPickLine"."pickId"
    AND "StockPick"."entityId" = "StockPickLine"."entityId"
  WHERE "StockPick"."status" = 'PICKED'
    AND "StockPickLine"."materialId" = "MaterialWarehouseStock"."materialId"
    AND "StockPickLine"."warehouseId" = "MaterialWarehouseStock"."warehouseId"
    AND "StockPickLine"."entityId" = "MaterialWarehouseStock"."entityId"
), 0) * 1000) / 1000;
