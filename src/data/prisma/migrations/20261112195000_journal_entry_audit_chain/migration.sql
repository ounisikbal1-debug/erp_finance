CREATE TABLE "JournalEntryAuditChainHead" (
  "entityId" TEXT NOT NULL PRIMARY KEY,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "lastHash" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "JournalEntryAuditRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousHash" TEXT,
  "entryHash" TEXT NOT NULL,
  "hashVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "JournalEntryAuditRecord_journalEntryId_key"
  ON "JournalEntryAuditRecord"("journalEntryId");
CREATE UNIQUE INDEX "JournalEntryAuditRecord_entityId_sequence_key"
  ON "JournalEntryAuditRecord"("entityId", "sequence");
CREATE INDEX "JournalEntryAuditRecord_entityId_sequence_idx"
  ON "JournalEntryAuditRecord"("entityId", "sequence");

INSERT INTO "JournalEntryAuditChainHead" ("entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt")
SELECT "id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Entity";

CREATE TRIGGER "Entity_JournalEntryAuditChainHead_insert"
AFTER INSERT ON "Entity"
BEGIN
  INSERT INTO "JournalEntryAuditChainHead" ("entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt")
  VALUES (NEW."id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END;

CREATE TRIGGER "JournalEntryAuditRecord_immutable_update"
BEFORE UPDATE ON "JournalEntryAuditRecord"
BEGIN
  SELECT RAISE(ABORT, 'SAFE_AUDIT_RECORD_IMMUTABLE');
END;

CREATE TRIGGER "JournalEntryAuditRecord_immutable_delete"
BEFORE DELETE ON "JournalEntryAuditRecord"
BEGIN
  SELECT RAISE(ABORT, 'SAFE_AUDIT_RECORD_IMMUTABLE');
END;
