CREATE TABLE "WithholdingCertificate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT,
  "cashflowPaymentId" TEXT,
  "certificateNumber" TEXT NOT NULL,
  "beneficiaryName" TEXT NOT NULL,
  "beneficiaryFiscalId" TEXT,
  "category" TEXT NOT NULL,
  "grossAmountTtc" REAL NOT NULL,
  "withholdingRate" REAL NOT NULL,
  "withholdingAmount" REAL NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'TND',
  "period" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "ruleSource" TEXT NOT NULL,
  "ruleSourceDate" TEXT,
  "ruleEffectiveFrom" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "preparedByUserId" TEXT NOT NULL,
  "preparedByUsername" TEXT NOT NULL,
  "issuedByUserId" TEXT,
  "issuedByUsername" TEXT,
  "issuedAt" DATETIME,
  "cancelledByUserId" TEXT,
  "cancelledByUsername" TEXT,
  "cancelledAt" DATETIME,
  "cancellationReason" TEXT,
  "revokedByUserId" TEXT,
  "revokedByUsername" TEXT,
  "revokedAt" DATETIME,
  "revocationReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WithholdingCertificate_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WithholdingCertificate_purchaseInvoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WithholdingCertificate_cashflowPaymentId_fkey"
    FOREIGN KEY ("cashflowPaymentId") REFERENCES "CashflowPayment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WithholdingCertificate_status_check"
    CHECK ("status" IN ('PREPARED', 'ISSUED', 'CANCELLED', 'REVOKED')),
  CONSTRAINT "WithholdingCertificate_sourceType_check"
    CHECK ("sourceType" IN ('PURCHASE_INVOICE', 'SUPPLIER_PAYMENT', 'OTHER')),
  CONSTRAINT "WithholdingCertificate_amount_check"
    CHECK ("grossAmountTtc" > 0 AND "withholdingRate" > 0 AND "withholdingRate" <= 100 AND "withholdingAmount" > 0)
);

CREATE UNIQUE INDEX "WithholdingCertificate_entityId_certificateNumber_key"
ON "WithholdingCertificate"("entityId", "certificateNumber");

CREATE UNIQUE INDEX "WithholdingCertificate_entityId_sourceType_sourceReference_category_period_key"
ON "WithholdingCertificate"("entityId", "sourceType", "sourceReference", "category", "period");

CREATE INDEX "WithholdingCertificate_entityId_status_period_idx"
ON "WithholdingCertificate"("entityId", "status", "period");

CREATE TABLE "WithholdingCertificateWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "certificateId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WithholdingCertificateWorkflowEvent_certificateId_fkey"
    FOREIGN KEY ("certificateId") REFERENCES "WithholdingCertificate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WithholdingCertificateWorkflowEvent_action_check"
    CHECK ("action" IN ('PREPARED', 'ISSUED', 'CANCELLED', 'REVOKED'))
);

CREATE UNIQUE INDEX "WithholdingCertificateWorkflowEvent_certificateId_action_key"
ON "WithholdingCertificateWorkflowEvent"("certificateId", "action");

CREATE INDEX "WithholdingCertificateWorkflowEvent_certificateId_createdAt_idx"
ON "WithholdingCertificateWorkflowEvent"("certificateId", "createdAt");
