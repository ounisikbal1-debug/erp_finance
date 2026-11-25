ALTER TABLE "MaintenanceWorkOrder" ADD COLUMN "actualCost" DOUBLE PRECISION;
ALTER TABLE "MaintenanceWorkOrder" ADD COLUMN "actualCostCurrencyCode" TEXT;
ALTER TABLE "MaintenanceWorkOrder" ADD COLUMN "completionOdometerKm" INTEGER;
