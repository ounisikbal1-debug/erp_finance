CREATE TABLE "PurchaseInvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseInvoiceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_entityId_fkey"
      FOREIGN KEY ("purchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoice" ("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoiceLine_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoiceLine_materialId_entityId_fkey"
      FOREIGN KEY ("materialId", "entityId") REFERENCES "Material" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockReceipt_id_purchaseInvoiceId_entityId_key"
  ON "StockReceipt"("id", "purchaseInvoiceId", "entityId");
CREATE UNIQUE INDEX "PurchaseInvoiceLine_id_purchaseInvoiceId_entityId_key"
  ON "PurchaseInvoiceLine"("id", "purchaseInvoiceId", "entityId");
CREATE INDEX "PurchaseInvoiceLine_entityId_purchaseInvoiceId_idx"
  ON "PurchaseInvoiceLine"("entityId", "purchaseInvoiceId");
CREATE INDEX "PurchaseInvoiceLine_entityId_materialId_idx"
  ON "PurchaseInvoiceLine"("entityId", "materialId");

CREATE TABLE "PurchaseInvoiceLineReceiptMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseInvoiceLineReceiptMatch_lineId_purchaseInvoiceId_entityId_fkey"
      FOREIGN KEY ("lineId", "purchaseInvoiceId", "entityId")
      REFERENCES "PurchaseInvoiceLine" ("id", "purchaseInvoiceId", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoiceLineReceiptMatch_receiptId_purchaseInvoiceId_entityId_fkey"
      FOREIGN KEY ("receiptId", "purchaseInvoiceId", "entityId")
      REFERENCES "StockReceipt" ("id", "purchaseInvoiceId", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseInvoiceLineReceiptMatch_receiptId_key"
  ON "PurchaseInvoiceLineReceiptMatch"("receiptId");
CREATE UNIQUE INDEX "PurchaseInvoiceLineReceiptMatch_receiptId_purchaseInvoiceId_entityId_key"
  ON "PurchaseInvoiceLineReceiptMatch"("receiptId", "purchaseInvoiceId", "entityId");
CREATE INDEX "PurchaseInvoiceLineReceiptMatch_entityId_purchaseInvoiceId_lineId_idx"
  ON "PurchaseInvoiceLineReceiptMatch"("entityId", "purchaseInvoiceId", "lineId");
