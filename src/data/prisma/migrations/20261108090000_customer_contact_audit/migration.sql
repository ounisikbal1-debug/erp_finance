CREATE TABLE "CustomerContactChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "previousValue" TEXT,
  "newValue" TEXT,
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerContactChange_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CustomerContactChange_customerId_createdAt_idx" ON "CustomerContactChange"("customerId", "createdAt");
