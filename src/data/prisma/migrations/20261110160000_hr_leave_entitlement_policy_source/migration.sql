ALTER TABLE "HrLeaveEntitlement" ADD COLUMN "policySource" TEXT;
ALTER TABLE "HrLeaveEntitlement" ADD COLUMN "effectiveFrom" DATETIME;
ALTER TABLE "HrLeaveEntitlementEvent" ADD COLUMN "policySource" TEXT;
ALTER TABLE "HrLeaveEntitlementEvent" ADD COLUMN "effectiveFrom" DATETIME;
