CREATE TABLE "AiRequestAuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "dataClass" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "cloudConsent" BOOLEAN NOT NULL DEFAULT false,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "latencyMs" INTEGER,
  "failureStatusCode" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRequestAuditEvent_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiRequestAuditEvent_requestId_eventType_key"
ON "AiRequestAuditEvent"("requestId", "eventType");

CREATE INDEX "AiRequestAuditEvent_entityId_requestId_createdAt_idx"
ON "AiRequestAuditEvent"("entityId", "requestId", "createdAt");

CREATE INDEX "AiRequestAuditEvent_entityId_createdAt_idx"
ON "AiRequestAuditEvent"("entityId", "createdAt");

CREATE TRIGGER "AiRequestAuditEvent_immutable_update"
BEFORE UPDATE ON "AiRequestAuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'SAFE_AI_AUDIT_EVENT_IMMUTABLE');
END;

CREATE TRIGGER "AiRequestAuditEvent_immutable_delete"
BEFORE DELETE ON "AiRequestAuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'SAFE_AI_AUDIT_EVENT_IMMUTABLE');
END;
