ALTER TABLE "JournalEntry" ADD COLUMN "reversesEntryId" TEXT;

CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key"
ON "JournalEntry"("reversesEntryId");

CREATE INDEX "JournalEntry_entityId_reversesEntryId_idx"
ON "JournalEntry"("entityId", "reversesEntryId");

-- The unique link is enforced here; the service verifies target existence,
-- company scope, posted state and original accounting lines transactionally.
