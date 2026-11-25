DROP INDEX "JournalEntry_reversesEntryId_key";

CREATE UNIQUE INDEX "JournalEntry_one_active_reversal_per_original_key"
ON "JournalEntry"("reversesEntryId")
WHERE "reversesEntryId" IS NOT NULL AND "status" <> 'REJECTED';

DROP INDEX "JournalEntryWorkflowEvent_journalEntryId_action_key";

CREATE INDEX "JournalEntryWorkflowEvent_journalEntryId_action_idx"
ON "JournalEntryWorkflowEvent"("journalEntryId", "action");

CREATE UNIQUE INDEX "JournalEntryWorkflowEvent_single_transition_action_key"
ON "JournalEntryWorkflowEvent"("journalEntryId", "action")
WHERE "action" NOT IN ('REVERSAL_REQUESTED', 'REVERSAL_REJECTED');

DROP INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_action_key";

CREATE INDEX "PurchaseInvoiceWorkflowEvent_purchaseInvoiceId_action_idx"
ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "action");

CREATE UNIQUE INDEX "PurchaseInvoiceWorkflowEvent_single_transition_action_key"
ON "PurchaseInvoiceWorkflowEvent"("purchaseInvoiceId", "action")
WHERE "action" NOT IN ('CANCELLATION_REQUESTED', 'CANCELLATION_REOPENED');

DROP INDEX "SalesInvoiceWorkflowEvent_invoiceId_action_key";

CREATE INDEX "SalesInvoiceWorkflowEvent_invoiceId_action_idx"
ON "SalesInvoiceWorkflowEvent"("invoiceId", "action");

CREATE UNIQUE INDEX "SalesInvoiceWorkflowEvent_single_transition_action_key"
ON "SalesInvoiceWorkflowEvent"("invoiceId", "action")
WHERE "action" NOT IN ('CANCELLATION_REQUESTED', 'CANCELLATION_REOPENED');
