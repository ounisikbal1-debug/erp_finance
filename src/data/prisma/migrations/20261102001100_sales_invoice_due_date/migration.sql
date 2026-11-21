ALTER TABLE "Invoice" ADD COLUMN "dueDate" DATETIME;

CREATE UNIQUE INDEX "CashForecastItem_scenarioId_sourceType_sourceId_key"
ON "CashForecastItem"("scenarioId", "sourceType", "sourceId");
