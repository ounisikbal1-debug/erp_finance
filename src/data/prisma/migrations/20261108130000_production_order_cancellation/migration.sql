ALTER TABLE "ProductionOrder" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "ProductionOrder" ADD COLUMN "cancelledByUserId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "cancelledByUsername" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "cancellationReason" TEXT;
