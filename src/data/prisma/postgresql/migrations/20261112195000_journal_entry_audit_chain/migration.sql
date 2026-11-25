CREATE TABLE "JournalEntryAuditChainHead" (
  "entityId" TEXT NOT NULL,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "lastHash" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JournalEntryAuditChainHead_pkey" PRIMARY KEY ("entityId")
);

CREATE TABLE "JournalEntryAuditRecord" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousHash" TEXT,
  "entryHash" TEXT NOT NULL,
  "hashVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntryAuditRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalEntryAuditRecord_journalEntryId_key"
  ON "JournalEntryAuditRecord"("journalEntryId");
CREATE UNIQUE INDEX "JournalEntryAuditRecord_entityId_sequence_key"
  ON "JournalEntryAuditRecord"("entityId", "sequence");
CREATE INDEX "JournalEntryAuditRecord_entityId_sequence_idx"
  ON "JournalEntryAuditRecord"("entityId", "sequence");

INSERT INTO "JournalEntryAuditChainHead" ("entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt")
SELECT "id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Entity";

CREATE FUNCTION "JournalEntryAuditRecord_immutable"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SAFE_AUDIT_RECORD_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntryAuditRecord_immutable_update"
BEFORE UPDATE OR DELETE ON "JournalEntryAuditRecord"
FOR EACH ROW EXECUTE FUNCTION "JournalEntryAuditRecord_immutable"();

CREATE FUNCTION "Entity_audit_chain_head_insert"() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "JournalEntryAuditChainHead"
    ("entityId", "lastSequence", "lastHash", "startedAt", "createdAt", "updatedAt")
  VALUES (NEW."id", 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("entityId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Entity_JournalEntryAuditChainHead_insert"
AFTER INSERT ON "Entity"
FOR EACH ROW EXECUTE FUNCTION "Entity_audit_chain_head_insert"();
