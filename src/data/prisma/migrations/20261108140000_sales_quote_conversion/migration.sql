CREATE TABLE "SalesQuoteConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "convertedByUserId" TEXT NOT NULL,
    "convertedByUsername" TEXT NOT NULL,
    "acceptanceNote" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesQuoteConversion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesQuoteConversion_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesQuoteConversion_quoteId_key" ON "SalesQuoteConversion"("quoteId");
CREATE UNIQUE INDEX "SalesQuoteConversion_invoiceId_key" ON "SalesQuoteConversion"("invoiceId");
CREATE INDEX "SalesQuoteConversion_entityId_createdAt_idx" ON "SalesQuoteConversion"("entityId", "createdAt");
