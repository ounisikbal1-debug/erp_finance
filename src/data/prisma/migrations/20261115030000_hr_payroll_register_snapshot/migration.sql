ALTER TABLE "Payslip" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'TND';
ALTER TABLE "Payslip" ADD COLUMN "calculationSnapshot" TEXT;
