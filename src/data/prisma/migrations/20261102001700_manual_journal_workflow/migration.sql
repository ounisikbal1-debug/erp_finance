ALTER TABLE "JournalEntry" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "createdByUsername" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "approvedByUsername" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "JournalEntry" ADD COLUMN "postedByUserId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "postedByUsername" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "postedAt" DATETIME;

CREATE INDEX "JournalEntry_entityId_status_createdAt_idx"
ON "JournalEntry"("entityId", "status", "createdAt");

CREATE TABLE "JournalEntryWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journalEntryId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntryWorkflowEvent_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "JournalEntryWorkflowEvent_journalEntryId_action_key"
ON "JournalEntryWorkflowEvent"("journalEntryId", "action");

CREATE INDEX "JournalEntryWorkflowEvent_journalEntryId_createdAt_idx"
ON "JournalEntryWorkflowEvent"("journalEntryId", "createdAt");
