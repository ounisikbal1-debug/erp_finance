-- CreateTable
CREATE TABLE "IntercompanyTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sellerEntityId" TEXT NOT NULL,
    "buyerEntityId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "sellerAmount" DOUBLE PRECISION NOT NULL,
    "buyerAmount" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "sellerReceivableAccountCode" TEXT NOT NULL,
    "sellerRevenueAccountCode" TEXT NOT NULL,
    "buyerInventoryAccountCode" TEXT NOT NULL,
    "buyerPayableAccountCode" TEXT NOT NULL,
    "sellerJournalEntryId" TEXT NOT NULL,
    "buyerJournalEntryId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sellerReconciledByUserId" TEXT,
    "sellerReconciledAt" TIMESTAMP(3),
    "buyerReconciledByUserId" TEXT,
    "buyerReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntercompanyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryProfile" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "currencySymbol" TEXT NOT NULL DEFAULT 'DT',
    "stampDuty" DOUBLE PRECISION NOT NULL DEFAULT 1.000,
    "corporateTax" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "salesReceivableAccountCode" TEXT,
    "salesRevenueAccountCode" TEXT,
    "salesVatAccountCode" TEXT,
    "salesStampDutyAccountCode" TEXT,
    "stockAssetAccountCode" TEXT,
    "stockAdjustmentAccountCode" TEXT,
    "productionWipAccountCode" TEXT,
    "productionLaborAccountCode" TEXT,
    "productionOverheadAccountCode" TEXT,
    "purchaseExpenseAccountCode" TEXT,
    "purchaseVatAccountCode" TEXT,
    "realizedFxGainAccountCode" TEXT,
    "realizedFxLossAccountCode" TEXT,
    "unrealizedFxGainAccountCode" TEXT,
    "unrealizedFxLossAccountCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "purchaseVatRecoverable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "sourceUnit" DOUBLE PRECISION NOT NULL,
    "sourceValue" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "employeeCnssRate" DOUBLE PRECISION NOT NULL DEFAULT 9.68,
    "employerCnssRate" DOUBLE PRECISION NOT NULL DEFAULT 16.57,
    "employerWorkAccidentRate" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "foprolosRate" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "cssRate" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "profExpensesRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "profExpensesMaxCap" DOUBLE PRECISION NOT NULL DEFAULT 2000.0,
    "headOfFamilyDeduction" DOUBLE PRECISION NOT NULL DEFAULT 300.0,
    "childDeduction" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "parentDeduction" DOUBLE PRECISION NOT NULL DEFAULT 450.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollTaxBracket" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "minAmount" DOUBLE PRECISION NOT NULL,
    "maxAmount" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollTaxBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "financialCategory" TEXT,
    "parentId" TEXT,
    "isPostingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversesEntryId" TEXT,
    "createdByUserId" TEXT,
    "createdByUsername" TEXT,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "postedByUsername" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryWorkflowEvent" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "description" TEXT,
    "costCenterCode" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'TN01',
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "tradeRegister" TEXT,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUserEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousRole" TEXT,
    "nextRole" TEXT NOT NULL,
    "previousEntityId" TEXT,
    "nextEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "supersedesLineId" TEXT,
    "revisionReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccountMapping" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowAccountingMapping" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "receivableAccountCode" TEXT,
    "payableAccountCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowAccountingMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "ledgerAccountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransfer" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceBankAccountId" TEXT NOT NULL,
    "destinationBankAccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "postingJournalEntryId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "originalFilename" TEXT,
    "lineCount" INTEGER NOT NULL,
    "importedByUserId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION,
    "currencyCode" TEXT NOT NULL,
    "externalReference" TEXT,
    "deduplicationKey" TEXT NOT NULL,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,
    "reconciledByUserId" TEXT,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastScenario" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "openingBalance" DOUBLE PRECISION,
    "openingBalanceDate" TIMESTAMP(3),
    "openingBalanceSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashForecastScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastItem" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashForecastItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowPayment" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "purchaseInvoiceId" TEXT,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "settledDocumentAmount" DOUBLE PRECISION,
    "documentCurrencyCode" TEXT,
    "carryingAmount" DOUBLE PRECISION,
    "settlementExchangeRate" DOUBLE PRECISION,
    "settlementRateDate" TIMESTAMP(3),
    "settlementRateSource" TEXT,
    "realizedFxGain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedFxLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRevaluationRun" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reversalDate" TIMESTAMP(3) NOT NULL,
    "functionalCurrencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "revaluationJournalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "createdByUserId" TEXT,
    "createdByUsername" TEXT,
    "reversalProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRevaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRevaluationItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "purchaseInvoiceId" TEXT,
    "direction" TEXT NOT NULL,
    "documentCurrencyCode" TEXT NOT NULL,
    "openDocumentAmount" DOUBLE PRECISION NOT NULL,
    "oldCarryingAmount" DOUBLE PRECISION NOT NULL,
    "revaluedCarryingAmount" DOUBLE PRECISION NOT NULL,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "exchangeRateEffectiveDate" TIMESTAMP(3) NOT NULL,
    "exchangeRateSource" TEXT NOT NULL,
    "exchangeRateSourceUrl" TEXT,
    "exchangeRateImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRevaluationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationGroup" (
    "id" TEXT NOT NULL,
    "ownerEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportingCurrencyCode" TEXT NOT NULL,
    "eliminationPolicy" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationEliminationConfirmation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "confirmedByUserId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidationEliminationConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationGroupEntity" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ownershipPercentage" DOUBLE PRECISION NOT NULL,
    "consolidationMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidationGroupEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationAccountMapping" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "localAccountCode" TEXT NOT NULL,
    "groupAccountCode" TEXT NOT NULL,
    "groupAccountDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidationAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationFxRate" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidationFxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationAdjustment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debitAccountCode" TEXT NOT NULL,
    "creditAccountCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ConsolidationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationRun" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reportingCurrencyCode" TEXT NOT NULL,
    "diagnostics" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationRunLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "groupAccountCode" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL,
    "credit" DOUBLE PRECISION NOT NULL,
    "lineType" TEXT NOT NULL,

    CONSTRAINT "ConsolidationRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "empId" TEXT,
    "cin" TEXT,
    "cnssNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position" TEXT,
    "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
    "maritalStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "isHeadOfFamily" BOOLEAN NOT NULL DEFAULT false,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "dependentParents" INTEGER NOT NULL DEFAULT 0,
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveRequest" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "HrLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveEntitlement" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitlementDays" INTEGER NOT NULL,
    "policySource" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "updatedByUserId" TEXT NOT NULL,
    "updatedByUsername" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrLeaveEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveEntitlementEvent" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "previousEntitlementDays" INTEGER,
    "nextEntitlementDays" INTEGER NOT NULL,
    "policySource" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLeaveEntitlementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "archivedByUsername" TEXT,
    "archiveNote" TEXT,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocumentFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByUsername" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeExpenseClaim" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "submittedByUserId" TEXT NOT NULL,
    "submittedByUsername" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedByUsername" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeExpenseClaimEvent" (
    "id" TEXT NOT NULL,
    "expenseClaimId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeExpenseClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentPosition" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closedByUsername" TEXT,

    CONSTRAINT "RecruitmentPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymizedAt" TIMESTAMP(3),
    "anonymizedByUserId" TEXT,
    "anonymizedByUsername" TEXT,

    CONSTRAINT "CandidateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInterviewEvent" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateInterviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRubrique" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRubrique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryPayrollRubrique" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryPayrollRubrique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryRegulatoryRevision" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "configType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reviewer" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvalNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "periodClosedAt" TIMESTAMP(3),
    "periodClosedBy" TEXT,
    "periodClosureNote" TEXT,
    "retroactiveConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryRegulatoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "employeeCnss" DOUBLE PRECISION NOT NULL,
    "employerCnss" DOUBLE PRECISION NOT NULL,
    "foprolos" DOUBLE PRECISION NOT NULL,
    "taxableGross" DOUBLE PRECISION NOT NULL,
    "irpp" DOUBLE PRECISION NOT NULL,
    "css" DOUBLE PRECISION NOT NULL,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "fiscalBenefitType" TEXT,
    "complementaryRetirementRate" DOUBLE PRECISION,
    "retirementContribution" DOUBLE PRECISION,
    "annualRetirementContributionDeduction" DOUBLE PRECISION,
    "irppBeforeRetirementGain" DOUBLE PRECISION,
    "cssBeforeRetirementGain" DOUBLE PRECISION,
    "gainIrpp" DOUBLE PRECISION,
    "gainCss" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'EA',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumStock" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialWarehouseStock" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialWarehouseStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT,
    "destinationWarehouseId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "purchaseOrderLineId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "returnedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSupplierReturn" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceReceiptId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPick" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PICKED',
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPickLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPickLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDispatch" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedByUserId" TEXT NOT NULL,
    "confirmedByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "transferId" TEXT,
    "movementType" TEXT NOT NULL,
    "deltaQuantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT,
    "outputMaterialId" TEXT NOT NULL,
    "outputQuantity" DOUBLE PRECISION NOT NULL,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scrapQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scrapReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "warehouseId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledByUsername" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderMaterialLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "warehouseId" TEXT,

    CONSTRAINT "ProductionOrderMaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "taxRateCode" TEXT NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "documentCurrencyCode" TEXT,
    "documentSubTotal" DOUBLE PRECISION,
    "documentTaxAmount" DOUBLE PRECISION,
    "documentTotalAmount" DOUBLE PRECISION,
    "functionalCurrencyCode" TEXT,
    "exchangeRate" DOUBLE PRECISION,
    "exchangeRateDate" TIMESTAMP(3),
    "exchangeRateSource" TEXT,
    "exchangeRateImportedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "createdByUserId" TEXT,
    "createdByUsername" TEXT,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "postedByUsername" TEXT,
    "postedAt" TIMESTAMP(3),
    "postingJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithholdingCertificate" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "cashflowPaymentId" TEXT,
    "certificateNumber" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryFiscalId" TEXT,
    "category" TEXT NOT NULL,
    "grossAmountTtc" DOUBLE PRECISION NOT NULL,
    "withholdingRate" DOUBLE PRECISION NOT NULL,
    "withholdingAmount" DOUBLE PRECISION NOT NULL,
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
    "issuedAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledByUsername" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "revokedByUserId" TEXT,
    "revokedByUsername" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithholdingCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithholdingCertificateWorkflowEvent" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithholdingCertificateWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialId" TEXT,
    "purchaseOrderLineId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "sourceInvoiceLineId" TEXT NOT NULL,
    "sourceReturnId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "supplierDocumentNumber" TEXT,
    "creditDate" TIMESTAMP(3),
    "currencyCode" TEXT NOT NULL,
    "functionalCurrencyCode" TEXT NOT NULL,
    "documentSubTotal" DOUBLE PRECISION NOT NULL,
    "documentTaxAmount" DOUBLE PRECISION NOT NULL,
    "documentTotalAmount" DOUBLE PRECISION NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "taxRateCode" TEXT NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "exchangeRateDate" TIMESTAMP(3),
    "exchangeRateSource" TEXT,
    "exchangeRateImportedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SUPPLIER_DOCUMENT',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "postedByUsername" TEXT,
    "postedAt" TIMESTAMP(3),
    "postingJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditNoteWorkflowEvent" (
    "id" TEXT NOT NULL,
    "supplierCreditNoteId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCreditNoteWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditNoteApplication" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "supplierCreditNoteId" TEXT NOT NULL,
    "targetPurchaseInvoiceId" TEXT NOT NULL,
    "documentAmount" DOUBLE PRECISION NOT NULL,
    "functionalAmount" DOUBLE PRECISION NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCreditNoteApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderWorkflowEvent" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLineReceiptMatch" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoiceLineReceiptMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceWorkflowEvent" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoiceWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContactChange" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContactChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT,
    "vatAccountCode" TEXT,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "stampDuty" DOUBLE PRECISION NOT NULL DEFAULT 1.000,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "documentCurrencyCode" TEXT,
    "documentSubTotal" DOUBLE PRECISION,
    "documentTaxAmount" DOUBLE PRECISION,
    "documentStampDuty" DOUBLE PRECISION,
    "documentTotalAmount" DOUBLE PRECISION,
    "functionalCurrencyCode" TEXT,
    "exchangeRate" DOUBLE PRECISION,
    "exchangeRateDate" TIMESTAMP(3),
    "exchangeRateSource" TEXT,
    "exchangeRateImportedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdByUsername" TEXT,
    "approvedByUserId" TEXT,
    "approvedByUsername" TEXT,
    "approvedAt" TIMESTAMP(3),
    "issuedByUserId" TEXT,
    "issuedByUsername" TEXT,
    "issuedAt" TIMESTAMP(3),
    "postingJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceWorkflowEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoiceWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "materialId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 19.0,
    "totalAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderStockPickLink" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "stockPickId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderStockPickLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderInvoiceLink" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderInvoiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalesQuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuoteConversion" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "convertedByUserId" TEXT NOT NULL,
    "convertedByUsername" TEXT NOT NULL,
    "acceptanceNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuoteConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCloseChecklistEvent" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyCloseChecklistEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCloseLock" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyCloseLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWorkOrder" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityFinding" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "owner" TEXT NOT NULL,
    "rootCause" TEXT,
    "containmentAction" TEXT,
    "closureNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityAction" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "verificationNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntercompanyTransaction_reference_key" ON "IntercompanyTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "IntercompanyTransaction_sellerJournalEntryId_key" ON "IntercompanyTransaction"("sellerJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "IntercompanyTransaction_buyerJournalEntryId_key" ON "IntercompanyTransaction"("buyerJournalEntryId");

-- CreateIndex
CREATE INDEX "IntercompanyTransaction_sellerEntityId_transactionDate_stat_idx" ON "IntercompanyTransaction"("sellerEntityId", "transactionDate", "status");

-- CreateIndex
CREATE INDEX "IntercompanyTransaction_buyerEntityId_transactionDate_statu_idx" ON "IntercompanyTransaction"("buyerEntityId", "transactionDate", "status");

-- CreateIndex
CREATE INDEX "IntercompanyTransaction_status_transactionDate_idx" ON "IntercompanyTransaction"("status", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "CountryProfile_code_key" ON "CountryProfile"("code");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveDate_idx" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_sourceName_baseCurrency_quoteCurrency_rateType_key" ON "ExchangeRate"("sourceName", "baseCurrency", "quoteCurrency", "rateType", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollConfig_countryId_key" ON "PayrollConfig"("countryId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_countryId_parentId_idx" ON "ChartOfAccount"("countryId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_countryId_code_key" ON "ChartOfAccount"("countryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_entityId_status_createdAt_idx" ON "JournalEntry"("entityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_entityId_reversesEntryId_idx" ON "JournalEntry"("entityId", "reversesEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryWorkflowEvent_journalEntryId_action_idx" ON "JournalEntryWorkflowEvent"("journalEntryId", "action");

-- CreateIndex
CREATE INDEX "JournalEntryWorkflowEvent_journalEntryId_createdAt_idx" ON "JournalEntryWorkflowEvent"("journalEntryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_name_key" ON "Entity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AdminUserEvent_targetUserId_createdAt_idx" ON "AdminUserEvent"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminUserEvent_createdAt_idx" ON "AdminUserEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BudgetLine_entityId_period_status_idx" ON "BudgetLine"("entityId", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_entityId_period_accountCode_revisionNumber_key" ON "BudgetLine"("entityId", "period", "accountCode", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccountMapping_entityId_accountCode_key" ON "CashAccountMapping"("entityId", "accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowAccountingMapping_entityId_key" ON "CashflowAccountingMapping"("entityId");

-- CreateIndex
CREATE INDEX "BankAccount_entityId_isActive_idx" ON "BankAccount"("entityId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_entityId_name_key" ON "BankAccount"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransfer_postingJournalEntryId_key" ON "BankTransfer"("postingJournalEntryId");

-- CreateIndex
CREATE INDEX "BankTransfer_entityId_transferredAt_idx" ON "BankTransfer"("entityId", "transferredAt");

-- CreateIndex
CREATE INDEX "BankTransfer_sourceBankAccountId_transferredAt_idx" ON "BankTransfer"("sourceBankAccountId", "transferredAt");

-- CreateIndex
CREATE INDEX "BankTransfer_destinationBankAccountId_transferredAt_idx" ON "BankTransfer"("destinationBankAccountId", "transferredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransfer_entityId_idempotencyKey_key" ON "BankTransfer"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BankStatement_entityId_importedAt_idx" ON "BankStatement"("entityId", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_bankAccountId_sourceHash_key" ON "BankStatement"("bankAccountId", "sourceHash");

-- CreateIndex
CREATE INDEX "BankStatementLine_entityId_transactionDate_idx" ON "BankStatementLine"("entityId", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_statementId_rowNumber_key" ON "BankStatementLine"("statementId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_bankAccountId_deduplicationKey_key" ON "BankStatementLine"("bankAccountId", "deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_statementLineId_key" ON "BankReconciliation"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_journalLineId_key" ON "BankReconciliation"("journalLineId");

-- CreateIndex
CREATE INDEX "BankReconciliation_entityId_reconciledAt_idx" ON "BankReconciliation"("entityId", "reconciledAt");

-- CreateIndex
CREATE INDEX "CashForecastScenario_entityId_createdAt_idx" ON "CashForecastScenario"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastScenario_entityId_name_key" ON "CashForecastScenario"("entityId", "name");

-- CreateIndex
CREATE INDEX "CashForecastItem_entityId_scenarioId_expectedDate_idx" ON "CashForecastItem"("entityId", "scenarioId", "expectedDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastItem_scenarioId_sourceType_sourceId_key" ON "CashForecastItem"("scenarioId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowPayment_statementLineId_key" ON "CashflowPayment"("statementLineId");

-- CreateIndex
CREATE INDEX "CashflowPayment_entityId_invoiceId_idx" ON "CashflowPayment"("entityId", "invoiceId");

-- CreateIndex
CREATE INDEX "CashflowPayment_entityId_purchaseInvoiceId_idx" ON "CashflowPayment"("entityId", "purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "CashflowPayment_entityId_paidAt_idx" ON "CashflowPayment"("entityId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationRun_revaluationJournalEntryId_key" ON "FxRevaluationRun"("revaluationJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationRun_reversalJournalEntryId_key" ON "FxRevaluationRun"("reversalJournalEntryId");

-- CreateIndex
CREATE INDEX "FxRevaluationRun_entityId_status_reversalDate_idx" ON "FxRevaluationRun"("entityId", "status", "reversalDate");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationRun_entityId_effectiveDate_key" ON "FxRevaluationRun"("entityId", "effectiveDate");

-- CreateIndex
CREATE INDEX "FxRevaluationItem_invoiceId_idx" ON "FxRevaluationItem"("invoiceId");

-- CreateIndex
CREATE INDEX "FxRevaluationItem_purchaseInvoiceId_idx" ON "FxRevaluationItem"("purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationItem_runId_invoiceId_key" ON "FxRevaluationItem"("runId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationItem_runId_purchaseInvoiceId_key" ON "FxRevaluationItem"("runId", "purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "ConsolidationGroup_ownerEntityId_createdAt_idx" ON "ConsolidationGroup"("ownerEntityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationGroup_ownerEntityId_name_key" ON "ConsolidationGroup"("ownerEntityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationEliminationConfirmation_groupId_period_key" ON "ConsolidationEliminationConfirmation"("groupId", "period");

-- CreateIndex
CREATE INDEX "ConsolidationGroupEntity_entityId_idx" ON "ConsolidationGroupEntity"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationGroupEntity_groupId_entityId_key" ON "ConsolidationGroupEntity"("groupId", "entityId");

-- CreateIndex
CREATE INDEX "ConsolidationAccountMapping_membershipId_groupAccountCode_idx" ON "ConsolidationAccountMapping"("membershipId", "groupAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationAccountMapping_membershipId_localAccountCode_key" ON "ConsolidationAccountMapping"("membershipId", "localAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationFxRate_membershipId_period_key" ON "ConsolidationFxRate"("membershipId", "period");

-- CreateIndex
CREATE INDEX "ConsolidationAdjustment_groupId_period_status_idx" ON "ConsolidationAdjustment"("groupId", "period", "status");

-- CreateIndex
CREATE INDEX "ConsolidationRun_groupId_period_createdAt_idx" ON "ConsolidationRun"("groupId", "period", "createdAt");

-- CreateIndex
CREATE INDEX "ConsolidationRunLine_runId_groupAccountCode_idx" ON "ConsolidationRunLine"("runId", "groupAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_empId_key" ON "Employee"("empId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "HrLeaveRequest_entityId_status_startAt_idx" ON "HrLeaveRequest"("entityId", "status", "startAt");

-- CreateIndex
CREATE INDEX "HrLeaveRequest_employeeId_startAt_endAt_idx" ON "HrLeaveRequest"("employeeId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "HrLeaveEntitlement_entityId_year_leaveType_idx" ON "HrLeaveEntitlement"("entityId", "year", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "HrLeaveEntitlement_employeeId_leaveType_year_key" ON "HrLeaveEntitlement"("employeeId", "leaveType", "year");

-- CreateIndex
CREATE INDEX "HrLeaveEntitlementEvent_entitlementId_createdAt_idx" ON "HrLeaveEntitlementEvent"("entitlementId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_status_idx" ON "EmployeeDocument"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_validUntil_idx" ON "EmployeeDocument"("employeeId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocumentFile_documentId_key" ON "EmployeeDocumentFile"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocumentFile_storageKey_key" ON "EmployeeDocumentFile"("storageKey");

-- CreateIndex
CREATE INDEX "EmployeeDocumentFile_uploadedAt_idx" ON "EmployeeDocumentFile"("uploadedAt");

-- CreateIndex
CREATE INDEX "EmployeeDocumentEvent_documentId_createdAt_idx" ON "EmployeeDocumentEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeExpenseClaim_employeeId_status_idx" ON "EmployeeExpenseClaim"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeExpenseClaim_employeeId_expenseDate_idx" ON "EmployeeExpenseClaim"("employeeId", "expenseDate");

-- CreateIndex
CREATE INDEX "EmployeeExpenseClaimEvent_expenseClaimId_createdAt_idx" ON "EmployeeExpenseClaimEvent"("expenseClaimId", "createdAt");

-- CreateIndex
CREATE INDEX "RecruitmentPosition_entityId_status_idx" ON "RecruitmentPosition"("entityId", "status");

-- CreateIndex
CREATE INDEX "CandidateApplication_positionId_status_idx" ON "CandidateApplication"("positionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_positionId_email_key" ON "CandidateApplication"("positionId", "email");

-- CreateIndex
CREATE INDEX "CandidateApplicationEvent_applicationId_createdAt_idx" ON "CandidateApplicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateInterview_applicationId_status_idx" ON "CandidateInterview"("applicationId", "status");

-- CreateIndex
CREATE INDEX "CandidateInterview_scheduledAt_idx" ON "CandidateInterview"("scheduledAt");

-- CreateIndex
CREATE INDEX "CandidateInterviewEvent_interviewId_createdAt_idx" ON "CandidateInterviewEvent"("interviewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRubrique_code_key" ON "PayrollRubrique"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPayrollRubrique_countryId_code_key" ON "CountryPayrollRubrique"("countryId", "code");

-- CreateIndex
CREATE INDEX "CountryRegulatoryRevision_countryId_configType_effectiveFro_idx" ON "CountryRegulatoryRevision"("countryId", "configType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CountryRegulatoryRevision_countryId_configType_version_key" ON "CountryRegulatoryRevision"("countryId", "configType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_employeeId_period_key" ON "Payslip"("employeeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Material_sku_key" ON "Material"("sku");

-- CreateIndex
CREATE INDEX "Material_entityId_minimumStock_idx" ON "Material"("entityId", "minimumStock");

-- CreateIndex
CREATE UNIQUE INDEX "Material_id_entityId_key" ON "Material"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_entityId_barcode_key" ON "Material"("entityId", "barcode");

-- CreateIndex
CREATE INDEX "Warehouse_entityId_name_idx" ON "Warehouse"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_id_entityId_key" ON "Warehouse"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_entityId_code_key" ON "Warehouse"("entityId", "code");

-- CreateIndex
CREATE INDEX "MaterialWarehouseStock_entityId_materialId_idx" ON "MaterialWarehouseStock"("entityId", "materialId");

-- CreateIndex
CREATE INDEX "MaterialWarehouseStock_entityId_warehouseId_idx" ON "MaterialWarehouseStock"("entityId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialWarehouseStock_materialId_warehouseId_key" ON "MaterialWarehouseStock"("materialId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockTransfer_entityId_materialId_createdAt_idx" ON "StockTransfer"("entityId", "materialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_id_entityId_key" ON "StockTransfer"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_entityId_idempotencyKey_key" ON "StockTransfer"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockReceipt_entityId_materialId_createdAt_idx" ON "StockReceipt"("entityId", "materialId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReceipt_entityId_warehouseId_createdAt_idx" ON "StockReceipt"("entityId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReceipt_entityId_purchaseInvoiceId_createdAt_idx" ON "StockReceipt"("entityId", "purchaseInvoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReceipt_entityId_purchaseOrderLineId_createdAt_idx" ON "StockReceipt"("entityId", "purchaseOrderLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_id_entityId_key" ON "StockReceipt"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_id_purchaseInvoiceId_entityId_key" ON "StockReceipt"("id", "purchaseInvoiceId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_entityId_idempotencyKey_key" ON "StockReceipt"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockSupplierReturn_entityId_sourceReceiptId_createdAt_idx" ON "StockSupplierReturn"("entityId", "sourceReceiptId", "createdAt");

-- CreateIndex
CREATE INDEX "StockSupplierReturn_entityId_warehouseId_createdAt_idx" ON "StockSupplierReturn"("entityId", "warehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockSupplierReturn_id_entityId_key" ON "StockSupplierReturn"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockSupplierReturn_entityId_idempotencyKey_key" ON "StockSupplierReturn"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockPick_entityId_status_createdAt_idx" ON "StockPick"("entityId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockPick_id_entityId_key" ON "StockPick"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockPick_entityId_reference_key" ON "StockPick"("entityId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "StockPick_entityId_idempotencyKey_key" ON "StockPick"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockPickLine_entityId_pickId_idx" ON "StockPickLine"("entityId", "pickId");

-- CreateIndex
CREATE INDEX "StockPickLine_entityId_materialId_warehouseId_idx" ON "StockPickLine"("entityId", "materialId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "StockPickLine_id_entityId_key" ON "StockPickLine"("id", "entityId");

-- CreateIndex
CREATE INDEX "StockDispatch_entityId_confirmedAt_idx" ON "StockDispatch"("entityId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockDispatch_id_entityId_key" ON "StockDispatch"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockDispatch_pickId_entityId_key" ON "StockDispatch"("pickId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockDispatch_entityId_idempotencyKey_key" ON "StockDispatch"("entityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_entityId_materialId_createdAt_idx" ON "StockMovement"("entityId", "materialId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_entityId_warehouseId_createdAt_idx" ON "StockMovement"("entityId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionOrder_entityId_status_createdAt_idx" ON "ProductionOrder"("entityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionOrder_warehouseId_idx" ON "ProductionOrder"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_entityId_orderNumber_key" ON "ProductionOrder"("entityId", "orderNumber");

-- CreateIndex
CREATE INDEX "ProductionOrderMaterialLine_warehouseId_idx" ON "ProductionOrderMaterialLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderMaterialLine_orderId_materialId_key" ON "ProductionOrderMaterialLine"("orderId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_postingJournalEntryId_key" ON "PurchaseInvoice"("postingJournalEntryId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_entityId_status_issueDate_idx" ON "PurchaseInvoice"("entityId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_entityId_invoiceNumber_key" ON "PurchaseInvoice"("entityId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_id_entityId_key" ON "PurchaseInvoice"("id", "entityId");

-- CreateIndex
CREATE INDEX "WithholdingCertificate_entityId_status_period_idx" ON "WithholdingCertificate"("entityId", "status", "period");

-- CreateIndex
CREATE UNIQUE INDEX "WithholdingCertificate_entityId_certificateNumber_key" ON "WithholdingCertificate"("entityId", "certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WithholdingCertificate_entityId_sourceType_sourceReference__key" ON "WithholdingCertificate"("entityId", "sourceType", "sourceReference", "category", "period");

-- CreateIndex
CREATE INDEX "WithholdingCertificateWorkflowEvent_certificateId_createdAt_idx" ON "WithholdingCertificateWorkflowEvent"("certificateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WithholdingCertificateWorkflowEvent_certificateId_action_key" ON "WithholdingCertificateWorkflowEvent"("certificateId", "action");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_entityId_purchaseInvoiceId_idx" ON "PurchaseInvoiceLine"("entityId", "purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_entityId_materialId_idx" ON "PurchaseInvoiceLine"("entityId", "materialId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_entityId_purchaseOrderLineId_idx" ON "PurchaseInvoiceLine"("entityId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoiceLine_id_purchaseInvoiceId_entityId_key" ON "PurchaseInvoiceLine"("id", "purchaseInvoiceId", "entityId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_entityId_status_createdAt_idx" ON "PurchaseOrder"("entityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_entityId_vendorId_createdAt_idx" ON "PurchaseOrder"("entityId", "vendorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_entityId_orderNumber_key" ON "PurchaseOrder"("entityId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_id_entityId_key" ON "PurchaseOrder"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_sourceReturnId_key" ON "SupplierCreditNote"("sourceReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_postingJournalEntryId_key" ON "SupplierCreditNote"("postingJournalEntryId");

-- CreateIndex
CREATE INDEX "SupplierCreditNote_entityId_status_createdAt_idx" ON "SupplierCreditNote"("entityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierCreditNote_entityId_sourceInvoiceId_idx" ON "SupplierCreditNote"("entityId", "sourceInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_entityId_supplierDocumentNumber_key" ON "SupplierCreditNote"("entityId", "supplierDocumentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_id_entityId_key" ON "SupplierCreditNote"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_sourceReturnId_entityId_key" ON "SupplierCreditNote"("sourceReturnId", "entityId");

-- CreateIndex
CREATE INDEX "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_action_idx" ON "SupplierCreditNoteWorkflowEvent"("supplierCreditNoteId", "action");

-- CreateIndex
CREATE INDEX "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_create_idx" ON "SupplierCreditNoteWorkflowEvent"("supplierCreditNoteId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierCreditNoteApplication_entityId_supplierCreditNoteId_idx" ON "SupplierCreditNoteApplication"("entityId", "supplierCreditNoteId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierCreditNoteApplication_entityId_targetPurchaseInvoic_idx" ON "SupplierCreditNoteApplication"("entityId", "targetPurchaseInvoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNoteApplication_entityId_idempotencyKey_key" ON "SupplierCreditNoteApplication"("entityId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNoteApplication_id_entityId_key" ON "SupplierCreditNoteApplication"("id", "entityId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_entityId_orderId_idx" ON "PurchaseOrderLine"("entityId", "orderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_entityId_materialId_idx" ON "PurchaseOrderLine"("entityId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_id_entityId_key" ON "PurchaseOrderLine"("id", "entityId");

-- CreateIndex
CREATE INDEX "PurchaseOrderWorkflowEvent_purchaseOrderId_action_idx" ON "PurchaseOrderWorkflowEvent"("purchaseOrderId", "action");

-- CreateIndex
CREATE INDEX "PurchaseOrderWorkflowEvent_purchaseOrderId_createdAt_idx" ON "PurchaseOrderWorkflowEvent"("purchaseOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoiceLineReceiptMatch_receiptId_key" ON "PurchaseInvoiceLineReceiptMatch"("receiptId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLineReceiptMatch_entityId_purchaseInvoiceId__idx" ON "PurchaseInvoiceLineReceiptMatch"("entityId", "purchaseInvoiceId", "lineId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoiceLineReceiptMatch_receiptId_purchaseInvoiceId_key" ON "PurchaseInvoiceLineReceiptMatch"("receiptId", "purchaseInvoiceId", "entityId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_action_idx" ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "action");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_createdAt_idx" ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_entityId_code_key" ON "Customer"("entityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_entityId_id_key" ON "Customer"("entityId", "id");

-- CreateIndex
CREATE INDEX "CustomerContactChange_customerId_createdAt_idx" ON "CustomerContactChange"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_postingJournalEntryId_key" ON "Invoice"("postingJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_entityId_key" ON "Invoice"("id", "entityId");

-- CreateIndex
CREATE INDEX "SalesInvoiceWorkflowEvent_invoiceId_action_idx" ON "SalesInvoiceWorkflowEvent"("invoiceId", "action");

-- CreateIndex
CREATE INDEX "SalesInvoiceWorkflowEvent_invoiceId_createdAt_idx" ON "SalesInvoiceWorkflowEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceItem_materialId_idx" ON "InvoiceItem"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_entityId_status_createdAt_idx" ON "SalesOrder"("entityId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_id_entityId_key" ON "SalesOrder"("id", "entityId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_entityId_orderId_idx" ON "SalesOrderLine"("entityId", "orderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_entityId_materialId_idx" ON "SalesOrderLine"("entityId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_id_entityId_key" ON "SalesOrderLine"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderStockPickLink_salesOrderId_entityId_key" ON "SalesOrderStockPickLink"("salesOrderId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderStockPickLink_stockPickId_entityId_key" ON "SalesOrderStockPickLink"("stockPickId", "entityId");

-- CreateIndex
CREATE INDEX "SalesOrderInvoiceLink_entityId_createdAt_idx" ON "SalesOrderInvoiceLink"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderInvoiceLink_salesOrderId_entityId_key" ON "SalesOrderInvoiceLink"("salesOrderId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderInvoiceLink_invoiceId_entityId_key" ON "SalesOrderInvoiceLink"("invoiceId", "entityId");

-- CreateIndex
CREATE INDEX "SalesQuote_entityId_createdAt_idx" ON "SalesQuote"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesQuote_customerId_idx" ON "SalesQuote"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuote_entityId_quoteNumber_key" ON "SalesQuote"("entityId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuoteItem_quoteId_position_key" ON "SalesQuoteItem"("quoteId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuoteConversion_quoteId_key" ON "SalesQuoteConversion"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuoteConversion_invoiceId_key" ON "SalesQuoteConversion"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesQuoteConversion_entityId_createdAt_idx" ON "SalesQuoteConversion"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "MonthlyCloseChecklistEvent_entityId_period_createdAt_idx" ON "MonthlyCloseChecklistEvent"("entityId", "period", "createdAt");

-- CreateIndex
CREATE INDEX "MonthlyCloseChecklistEvent_entityId_period_checkKey_created_idx" ON "MonthlyCloseChecklistEvent"("entityId", "period", "checkKey", "createdAt");

-- CreateIndex
CREATE INDEX "MonthlyCloseLock_entityId_lockedAt_idx" ON "MonthlyCloseLock"("entityId", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCloseLock_entityId_period_key" ON "MonthlyCloseLock"("entityId", "period");

-- CreateIndex
CREATE INDEX "Equipment_entityId_status_name_idx" ON "Equipment"("entityId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_id_entityId_key" ON "Equipment"("id", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_entityId_assetTag_key" ON "Equipment"("entityId", "assetTag");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_entityId_status_scheduledAt_idx" ON "MaintenanceWorkOrder"("entityId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_equipmentId_scheduledAt_idx" ON "MaintenanceWorkOrder"("equipmentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "QualityFinding_entityId_status_severity_dueAt_idx" ON "QualityFinding"("entityId", "status", "severity", "dueAt");

-- CreateIndex
CREATE INDEX "QualityFinding_equipmentId_createdAt_idx" ON "QualityFinding"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityAction_findingId_status_dueAt_idx" ON "QualityAction"("findingId", "status", "dueAt");

-- AddForeignKey
ALTER TABLE "IntercompanyTransaction" ADD CONSTRAINT "IntercompanyTransaction_sellerEntityId_fkey" FOREIGN KEY ("sellerEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercompanyTransaction" ADD CONSTRAINT "IntercompanyTransaction_buyerEntityId_fkey" FOREIGN KEY ("buyerEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercompanyTransaction" ADD CONSTRAINT "IntercompanyTransaction_sellerJournalEntryId_fkey" FOREIGN KEY ("sellerJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercompanyTransaction" ADD CONSTRAINT "IntercompanyTransaction_buyerJournalEntryId_fkey" FOREIGN KEY ("buyerJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollConfig" ADD CONSTRAINT "PayrollConfig_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollTaxBracket" ADD CONSTRAINT "PayrollTaxBracket_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryWorkflowEvent" ADD CONSTRAINT "JournalEntryWorkflowEvent_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccountMapping" ADD CONSTRAINT "CashAccountMapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowAccountingMapping" ADD CONSTRAINT "CashflowAccountingMapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_sourceBankAccountId_fkey" FOREIGN KEY ("sourceBankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_destinationBankAccountId_fkey" FOREIGN KEY ("destinationBankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_postingJournalEntryId_fkey" FOREIGN KEY ("postingJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastScenario" ADD CONSTRAINT "CashForecastScenario_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastScenario" ADD CONSTRAINT "CashForecastScenario_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastItem" ADD CONSTRAINT "CashForecastItem_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastItem" ADD CONSTRAINT "CashForecastItem_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "CashForecastScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowPayment" ADD CONSTRAINT "CashflowPayment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowPayment" ADD CONSTRAINT "CashflowPayment_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowPayment" ADD CONSTRAINT "CashflowPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowPayment" ADD CONSTRAINT "CashflowPayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationRun" ADD CONSTRAINT "FxRevaluationRun_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationRun" ADD CONSTRAINT "FxRevaluationRun_revaluationJournalEntryId_fkey" FOREIGN KEY ("revaluationJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationRun" ADD CONSTRAINT "FxRevaluationRun_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationItem" ADD CONSTRAINT "FxRevaluationItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FxRevaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationItem" ADD CONSTRAINT "FxRevaluationItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRevaluationItem" ADD CONSTRAINT "FxRevaluationItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationGroup" ADD CONSTRAINT "ConsolidationGroup_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationEliminationConfirmation" ADD CONSTRAINT "ConsolidationEliminationConfirmation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationGroupEntity" ADD CONSTRAINT "ConsolidationGroupEntity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationGroupEntity" ADD CONSTRAINT "ConsolidationGroupEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationAccountMapping" ADD CONSTRAINT "ConsolidationAccountMapping_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ConsolidationGroupEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationFxRate" ADD CONSTRAINT "ConsolidationFxRate_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ConsolidationGroupEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationAdjustment" ADD CONSTRAINT "ConsolidationAdjustment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationRun" ADD CONSTRAINT "ConsolidationRun_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationRunLine" ADD CONSTRAINT "ConsolidationRunLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ConsolidationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveEntitlement" ADD CONSTRAINT "HrLeaveEntitlement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveEntitlement" ADD CONSTRAINT "HrLeaveEntitlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveEntitlementEvent" ADD CONSTRAINT "HrLeaveEntitlementEvent_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "HrLeaveEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentFile" ADD CONSTRAINT "EmployeeDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentEvent" ADD CONSTRAINT "EmployeeDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExpenseClaim" ADD CONSTRAINT "EmployeeExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExpenseClaimEvent" ADD CONSTRAINT "EmployeeExpenseClaimEvent_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "EmployeeExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentPosition" ADD CONSTRAINT "RecruitmentPosition_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "RecruitmentPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateApplicationEvent" ADD CONSTRAINT "CandidateApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterviewEvent" ADD CONSTRAINT "CandidateInterviewEvent_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "CandidateInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryPayrollRubrique" ADD CONSTRAINT "CountryPayrollRubrique_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryRegulatoryRevision" ADD CONSTRAINT "CountryRegulatoryRevision_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouseId_entityId_fkey" FOREIGN KEY ("sourceWarehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouseId_entityId_fkey" FOREIGN KEY ("destinationWarehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_purchaseInvoiceId_entityId_fkey" FOREIGN KEY ("purchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSupplierReturn" ADD CONSTRAINT "StockSupplierReturn_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSupplierReturn" ADD CONSTRAINT "StockSupplierReturn_sourceReceiptId_entityId_fkey" FOREIGN KEY ("sourceReceiptId", "entityId") REFERENCES "StockReceipt"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSupplierReturn" ADD CONSTRAINT "StockSupplierReturn_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSupplierReturn" ADD CONSTRAINT "StockSupplierReturn_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPick" ADD CONSTRAINT "StockPick_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPickLine" ADD CONSTRAINT "StockPickLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPickLine" ADD CONSTRAINT "StockPickLine_pickId_entityId_fkey" FOREIGN KEY ("pickId", "entityId") REFERENCES "StockPick"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPickLine" ADD CONSTRAINT "StockPickLine_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPickLine" ADD CONSTRAINT "StockPickLine_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDispatch" ADD CONSTRAINT "StockDispatch_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDispatch" ADD CONSTRAINT "StockDispatch_pickId_entityId_fkey" FOREIGN KEY ("pickId", "entityId") REFERENCES "StockPick"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_entityId_fkey" FOREIGN KEY ("warehouseId", "entityId") REFERENCES "Warehouse"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_transferId_entityId_fkey" FOREIGN KEY ("transferId", "entityId") REFERENCES "StockTransfer"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_outputMaterialId_fkey" FOREIGN KEY ("outputMaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderMaterialLine" ADD CONSTRAINT "ProductionOrderMaterialLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderMaterialLine" ADD CONSTRAINT "ProductionOrderMaterialLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderMaterialLine" ADD CONSTRAINT "ProductionOrderMaterialLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingCertificate" ADD CONSTRAINT "WithholdingCertificate_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingCertificate" ADD CONSTRAINT "WithholdingCertificate_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingCertificate" ADD CONSTRAINT "WithholdingCertificate_cashflowPaymentId_fkey" FOREIGN KEY ("cashflowPaymentId") REFERENCES "CashflowPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingCertificateWorkflowEvent" ADD CONSTRAINT "WithholdingCertificateWorkflowEvent_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "WithholdingCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_entityId_fkey" FOREIGN KEY ("purchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_sourceInvoiceId_entityId_fkey" FOREIGN KEY ("sourceInvoiceId", "entityId") REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_sourceInvoiceLineId_sourceInvoiceId_ent_fkey" FOREIGN KEY ("sourceInvoiceLineId", "sourceInvoiceId", "entityId") REFERENCES "PurchaseInvoiceLine"("id", "purchaseInvoiceId", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_sourceReturnId_entityId_fkey" FOREIGN KEY ("sourceReturnId", "entityId") REFERENCES "StockSupplierReturn"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_postingJournalEntryId_fkey" FOREIGN KEY ("postingJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNoteWorkflowEvent" ADD CONSTRAINT "SupplierCreditNoteWorkflowEvent_supplierCreditNoteId_fkey" FOREIGN KEY ("supplierCreditNoteId") REFERENCES "SupplierCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNoteApplication" ADD CONSTRAINT "SupplierCreditNoteApplication_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNoteApplication" ADD CONSTRAINT "SupplierCreditNoteApplication_supplierCreditNoteId_entityI_fkey" FOREIGN KEY ("supplierCreditNoteId", "entityId") REFERENCES "SupplierCreditNote"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNoteApplication" ADD CONSTRAINT "SupplierCreditNoteApplication_targetPurchaseInvoiceId_enti_fkey" FOREIGN KEY ("targetPurchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_entityId_fkey" FOREIGN KEY ("orderId", "entityId") REFERENCES "PurchaseOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderWorkflowEvent" ADD CONSTRAINT "PurchaseOrderWorkflowEvent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLineReceiptMatch" ADD CONSTRAINT "PurchaseInvoiceLineReceiptMatch_lineId_purchaseInvoiceId_e_fkey" FOREIGN KEY ("lineId", "purchaseInvoiceId", "entityId") REFERENCES "PurchaseInvoiceLine"("id", "purchaseInvoiceId", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLineReceiptMatch" ADD CONSTRAINT "PurchaseInvoiceLineReceiptMatch_receiptId_purchaseInvoiceI_fkey" FOREIGN KEY ("receiptId", "purchaseInvoiceId", "entityId") REFERENCES "StockReceipt"("id", "purchaseInvoiceId", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceWorkflowEvent" ADD CONSTRAINT "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContactChange" ADD CONSTRAINT "CustomerContactChange_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceWorkflowEvent" ADD CONSTRAINT "SalesInvoiceWorkflowEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_entityId_fkey" FOREIGN KEY ("orderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_materialId_entityId_fkey" FOREIGN KEY ("materialId", "entityId") REFERENCES "Material"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderStockPickLink" ADD CONSTRAINT "SalesOrderStockPickLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderStockPickLink" ADD CONSTRAINT "SalesOrderStockPickLink_salesOrderId_entityId_fkey" FOREIGN KEY ("salesOrderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderStockPickLink" ADD CONSTRAINT "SalesOrderStockPickLink_stockPickId_entityId_fkey" FOREIGN KEY ("stockPickId", "entityId") REFERENCES "StockPick"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderInvoiceLink" ADD CONSTRAINT "SalesOrderInvoiceLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderInvoiceLink" ADD CONSTRAINT "SalesOrderInvoiceLink_salesOrderId_entityId_fkey" FOREIGN KEY ("salesOrderId", "entityId") REFERENCES "SalesOrder"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderInvoiceLink" ADD CONSTRAINT "SalesOrderInvoiceLink_invoiceId_entityId_fkey" FOREIGN KEY ("invoiceId", "entityId") REFERENCES "Invoice"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_entityId_customerId_fkey" FOREIGN KEY ("entityId", "customerId") REFERENCES "Customer"("entityId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteItem" ADD CONSTRAINT "SalesQuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteConversion" ADD CONSTRAINT "SalesQuoteConversion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteConversion" ADD CONSTRAINT "SalesQuoteConversion_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCloseChecklistEvent" ADD CONSTRAINT "MonthlyCloseChecklistEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCloseLock" ADD CONSTRAINT "MonthlyCloseLock_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_equipmentId_entityId_fkey" FOREIGN KEY ("equipmentId", "entityId") REFERENCES "Equipment"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityFinding" ADD CONSTRAINT "QualityFinding_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityFinding" ADD CONSTRAINT "QualityFinding_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAction" ADD CONSTRAINT "QualityAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "QualityFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  foreign_key RECORD;
BEGIN
  FOR foreign_key IN
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',
      foreign_key.table_name,
      foreign_key.conname
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "safe_enforce_journal_period_lock"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  checked_entity_id TEXT;
  checked_date TIMESTAMP;
  advisory_key TEXT;
BEGIN
  FOR advisory_key IN
    SELECT DISTINCT candidate.lock_key
    FROM unnest(ARRAY[
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD."entityId" || ':' || to_char(OLD."date", 'YYYY-MM') END,
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD."entityId" || ':' || to_char(OLD."date", 'YYYY') END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW."entityId" || ':' || to_char(NEW."date", 'YYYY-MM') END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW."entityId" || ':' || to_char(NEW."date", 'YYYY') END
    ]) AS candidate(lock_key)
    WHERE candidate.lock_key IS NOT NULL
    ORDER BY candidate.lock_key
  LOOP
    PERFORM pg_advisory_xact_lock(814432, hashtext(advisory_key));
  END LOOP;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    checked_entity_id := OLD."entityId";
    checked_date := OLD."date";
    IF EXISTS (
      SELECT 1
      FROM "MonthlyCloseLock"
      WHERE "entityId" = checked_entity_id
        AND "period" IN (to_char(checked_date, 'YYYY-MM'), to_char(checked_date, 'YYYY'))
    ) THEN
      RAISE EXCEPTION 'SAFE_PERIOD_LOCKED';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    checked_entity_id := NEW."entityId";
    checked_date := NEW."date";
    IF EXISTS (
      SELECT 1
      FROM "MonthlyCloseLock"
      WHERE "entityId" = checked_entity_id
        AND "period" IN (to_char(checked_date, 'YYYY-MM'), to_char(checked_date, 'YYYY'))
    ) THEN
      RAISE EXCEPTION 'SAFE_PERIOD_LOCKED';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "JournalEntry_locked_period_insert"
BEFORE INSERT ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "safe_enforce_journal_period_lock"();

CREATE TRIGGER "JournalEntry_locked_period_update"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "safe_enforce_journal_period_lock"();

CREATE TRIGGER "JournalEntry_locked_period_delete"
BEFORE DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "safe_enforce_journal_period_lock"();

CREATE OR REPLACE FUNCTION "safe_prevent_monthly_close_lock_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SAFE_PERIOD_LOCK_IMMUTABLE';
END;
$$;

CREATE TRIGGER "MonthlyCloseLock_immutable_update"
BEFORE UPDATE ON "MonthlyCloseLock"
FOR EACH ROW EXECUTE FUNCTION "safe_prevent_monthly_close_lock_mutation"();

CREATE TRIGGER "MonthlyCloseLock_immutable_delete"
BEFORE DELETE ON "MonthlyCloseLock"
FOR EACH ROW EXECUTE FUNCTION "safe_prevent_monthly_close_lock_mutation"();

CREATE OR REPLACE FUNCTION "safe_lock_monthly_close_period"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    814432,
    hashtext(NEW."entityId" || ':' || NEW."period")
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "MonthlyCloseLock_lock_period_insert"
BEFORE INSERT ON "MonthlyCloseLock"
FOR EACH ROW EXECUTE FUNCTION "safe_lock_monthly_close_period"();
