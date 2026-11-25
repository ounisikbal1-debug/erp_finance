ALTER TABLE "IntercompanyTransaction" ADD COLUMN "sellerConventionApprovedByUserId" TEXT;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "sellerConventionApprovedAt" TIMESTAMP(3);
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "buyerConventionApprovedByUserId" TEXT;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "buyerConventionApprovedAt" TIMESTAMP(3);
