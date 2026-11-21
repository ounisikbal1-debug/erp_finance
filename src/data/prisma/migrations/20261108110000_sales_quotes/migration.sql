CREATE TABLE "SalesQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subTotal" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesQuote_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesQuote_customerId_entityId_fkey" FOREIGN KEY ("entityId", "customerId") REFERENCES "Customer" ("entityId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesQuote_entityId_quoteNumber_key" ON "SalesQuote"("entityId", "quoteNumber");
CREATE INDEX "SalesQuote_entityId_createdAt_idx" ON "SalesQuote"("entityId", "createdAt");
CREATE INDEX "SalesQuote_customerId_idx" ON "SalesQuote"("customerId");

CREATE TABLE "SalesQuoteItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "taxRate" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    CONSTRAINT "SalesQuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesQuoteItem_quoteId_position_key" ON "SalesQuoteItem"("quoteId", "position");
