CREATE TABLE "MonthlyCloseLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "lockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyCloseLock_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MonthlyCloseLock_entityId_period_key" ON "MonthlyCloseLock"("entityId", "period");
CREATE INDEX "MonthlyCloseLock_entityId_lockedAt_idx" ON "MonthlyCloseLock"("entityId", "lockedAt");

CREATE TRIGGER "JournalEntry_locked_period_insert"
BEFORE INSERT ON "JournalEntry"
WHEN EXISTS (
    SELECT 1 FROM "MonthlyCloseLock"
    WHERE "entityId" = NEW."entityId"
      AND ("period" = strftime('%Y-%m', NEW."date") OR "period" = strftime('%Y', NEW."date"))
)
BEGIN
    SELECT RAISE(ABORT, 'SAFE_PERIOD_LOCKED');
END;

CREATE TRIGGER "JournalEntry_locked_period_update"
BEFORE UPDATE ON "JournalEntry"
WHEN EXISTS (
    SELECT 1 FROM "MonthlyCloseLock"
    WHERE "entityId" = OLD."entityId"
      AND ("period" = strftime('%Y-%m', OLD."date") OR "period" = strftime('%Y', OLD."date"))
) OR EXISTS (
    SELECT 1 FROM "MonthlyCloseLock"
    WHERE "entityId" = NEW."entityId"
      AND ("period" = strftime('%Y-%m', NEW."date") OR "period" = strftime('%Y', NEW."date"))
)
BEGIN
    SELECT RAISE(ABORT, 'SAFE_PERIOD_LOCKED');
END;

CREATE TRIGGER "JournalEntry_locked_period_delete"
BEFORE DELETE ON "JournalEntry"
WHEN EXISTS (
    SELECT 1 FROM "MonthlyCloseLock"
    WHERE "entityId" = OLD."entityId"
      AND ("period" = strftime('%Y-%m', OLD."date") OR "period" = strftime('%Y', OLD."date"))
)
BEGIN
    SELECT RAISE(ABORT, 'SAFE_PERIOD_LOCKED');
END;

CREATE TRIGGER "MonthlyCloseLock_immutable_update"
BEFORE UPDATE ON "MonthlyCloseLock"
BEGIN
    SELECT RAISE(ABORT, 'SAFE_PERIOD_LOCK_IMMUTABLE');
END;

CREATE TRIGGER "MonthlyCloseLock_immutable_delete"
BEFORE DELETE ON "MonthlyCloseLock"
BEGIN
    SELECT RAISE(ABORT, 'SAFE_PERIOD_LOCK_IMMUTABLE');
END;
