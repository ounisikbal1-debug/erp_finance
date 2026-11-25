ALTER TABLE "IntercompanyTransaction" ADD COLUMN "sellerConventionApprovedByUserId" TEXT;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "sellerConventionApprovedAt" DATETIME;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "buyerConventionApprovedByUserId" TEXT;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "buyerConventionApprovedAt" DATETIME;
