CREATE TABLE "MonthlyCloseChecklistEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyCloseChecklistEvent_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MonthlyCloseChecklistEvent_entityId_period_createdAt_idx"
  ON "MonthlyCloseChecklistEvent"("entityId", "period", "createdAt");
CREATE INDEX "MonthlyCloseChecklistEvent_entityId_period_checkKey_createdAt_idx"
  ON "MonthlyCloseChecklistEvent"("entityId", "period", "checkKey", "createdAt");
