CREATE UNIQUE INDEX "SalesQuote_id_entityId_key" ON "SalesQuote"("id", "entityId");

CREATE TABLE "SalesQuoteOrderConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "convertedByUserId" TEXT NOT NULL,
    "convertedByUsername" TEXT NOT NULL,
    "acceptanceNote" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesQuoteOrderConversion_quoteId_entityId_fkey"
      FOREIGN KEY ("quoteId", "entityId") REFERENCES "SalesQuote" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesQuoteOrderConversion_salesOrderId_entityId_fkey"
      FOREIGN KEY ("salesOrderId", "entityId") REFERENCES "SalesOrder" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesQuoteOrderConversion_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesQuoteOrderConversion_quoteId_entityId_key" ON "SalesQuoteOrderConversion"("quoteId", "entityId");
CREATE UNIQUE INDEX "SalesQuoteOrderConversion_salesOrderId_entityId_key" ON "SalesQuoteOrderConversion"("salesOrderId", "entityId");
CREATE INDEX "SalesQuoteOrderConversion_entityId_createdAt_idx" ON "SalesQuoteOrderConversion"("entityId", "createdAt");
