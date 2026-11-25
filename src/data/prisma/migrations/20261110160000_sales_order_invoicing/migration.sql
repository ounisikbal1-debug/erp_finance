CREATE UNIQUE INDEX "Invoice_id_entityId_key" ON "Invoice"("id", "entityId");

CREATE TABLE "SalesOrderInvoiceLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("salesOrderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("invoiceId", "entityId") REFERENCES "Invoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesOrderInvoiceLink_salesOrderId_entityId_key" ON "SalesOrderInvoiceLink"("salesOrderId", "entityId");
CREATE UNIQUE INDEX "SalesOrderInvoiceLink_invoiceId_entityId_key" ON "SalesOrderInvoiceLink"("invoiceId", "entityId");
CREATE INDEX "SalesOrderInvoiceLink_entityId_createdAt_idx" ON "SalesOrderInvoiceLink"("entityId", "createdAt");
