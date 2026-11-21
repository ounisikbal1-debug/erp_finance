ALTER TABLE "CountryProfile" ADD COLUMN "realizedFxGainAccountCode" TEXT;
ALTER TABLE "CountryProfile" ADD COLUMN "realizedFxLossAccountCode" TEXT;

ALTER TABLE "CashflowPayment" ADD COLUMN "settledDocumentAmount" REAL;
ALTER TABLE "CashflowPayment" ADD COLUMN "documentCurrencyCode" TEXT;
ALTER TABLE "CashflowPayment" ADD COLUMN "carryingAmount" REAL;
ALTER TABLE "CashflowPayment" ADD COLUMN "settlementExchangeRate" REAL;
ALTER TABLE "CashflowPayment" ADD COLUMN "settlementRateDate" DATETIME;
ALTER TABLE "CashflowPayment" ADD COLUMN "settlementRateSource" TEXT;
ALTER TABLE "CashflowPayment" ADD COLUMN "realizedFxGain" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CashflowPayment" ADD COLUMN "realizedFxLoss" REAL NOT NULL DEFAULT 0;
