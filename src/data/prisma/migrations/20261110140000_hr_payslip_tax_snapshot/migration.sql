ALTER TABLE "Payslip" ADD COLUMN "fiscalBenefitType" TEXT;
ALTER TABLE "Payslip" ADD COLUMN "complementaryRetirementRate" REAL;
ALTER TABLE "Payslip" ADD COLUMN "retirementContribution" REAL;
ALTER TABLE "Payslip" ADD COLUMN "annualRetirementContributionDeduction" REAL;
ALTER TABLE "Payslip" ADD COLUMN "irppBeforeRetirementGain" REAL;
ALTER TABLE "Payslip" ADD COLUMN "cssBeforeRetirementGain" REAL;
ALTER TABLE "Payslip" ADD COLUMN "gainIrpp" REAL;
ALTER TABLE "Payslip" ADD COLUMN "gainCss" REAL;
