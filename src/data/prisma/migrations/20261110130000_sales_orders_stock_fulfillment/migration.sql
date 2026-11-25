ALTER TABLE "SalesOrder" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalesOrder" ADD COLUMN "createdByUserId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "SalesOrder" ADD COLUMN "createdByUsername" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "InvoiceItem" ADD COLUMN "materialId" TEXT REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SalesOrder_id_entityId_key" ON "SalesOrder"("id", "entityId");
CREATE INDEX "SalesOrder_entityId_status_createdAt_idx" ON "SalesOrder"("entityId", "status", "createdAt");
CREATE INDEX "InvoiceItem_materialId_idx" ON "InvoiceItem"("materialId");

CREATE TABLE "SalesOrderLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unitPrice" REAL NOT NULL,
  "totalAmount" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "entityId"),
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("orderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SalesOrderLine_entityId_orderId_idx" ON "SalesOrderLine"("entityId", "orderId");
CREATE INDEX "SalesOrderLine_entityId_materialId_idx" ON "SalesOrderLine"("entityId", "materialId");

CREATE TABLE "SalesOrderStockPickLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "stockPickId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("salesOrderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("stockPickId", "entityId") REFERENCES "StockPick"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesOrderStockPickLink_salesOrderId_entityId_key" ON "SalesOrderStockPickLink"("salesOrderId", "entityId");
CREATE UNIQUE INDEX "SalesOrderStockPickLink_stockPickId_entityId_key" ON "SalesOrderStockPickLink"("stockPickId", "entityId");
