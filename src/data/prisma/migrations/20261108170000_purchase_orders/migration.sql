CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expectedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_vendorId_fkey"
      FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseOrder_entityId_orderNumber_key"
ON "PurchaseOrder"("entityId", "orderNumber");
CREATE UNIQUE INDEX "PurchaseOrder_id_entityId_key"
ON "PurchaseOrder"("id", "entityId");
CREATE INDEX "PurchaseOrder_entityId_status_createdAt_idx"
ON "PurchaseOrder"("entityId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_entityId_vendorId_createdAt_idx"
ON "PurchaseOrder"("entityId", "vendorId", "createdAt");

CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderLine_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderLine_orderId_entityId_fkey"
      FOREIGN KEY ("orderId", "entityId") REFERENCES "PurchaseOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderLine_materialId_entityId_fkey"
      FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseOrderLine_id_entityId_key"
ON "PurchaseOrderLine"("id", "entityId");
CREATE INDEX "PurchaseOrderLine_entityId_orderId_idx"
ON "PurchaseOrderLine"("entityId", "orderId");
CREATE INDEX "PurchaseOrderLine_entityId_materialId_idx"
ON "PurchaseOrderLine"("entityId", "materialId");

CREATE TABLE "PurchaseOrderWorkflowEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderWorkflowEvent_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PurchaseOrderWorkflowEvent_purchaseOrderId_action_idx"
ON "PurchaseOrderWorkflowEvent"("purchaseOrderId", "action");
CREATE INDEX "PurchaseOrderWorkflowEvent_purchaseOrderId_createdAt_idx"
ON "PurchaseOrderWorkflowEvent"("purchaseOrderId", "createdAt");

ALTER TABLE "StockReceipt" ADD COLUMN "purchaseOrderLineId" TEXT;
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN "purchaseOrderLineId" TEXT;

CREATE INDEX "StockReceipt_entityId_purchaseOrderLineId_createdAt_idx"
ON "StockReceipt"("entityId", "purchaseOrderLineId", "createdAt");
CREATE INDEX "PurchaseInvoiceLine_entityId_purchaseOrderLineId_idx"
ON "PurchaseInvoiceLine"("entityId", "purchaseOrderLineId");
