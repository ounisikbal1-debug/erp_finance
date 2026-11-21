CREATE TABLE "AiRequestAuditEvent" (
  "id" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRequestAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiRequestAuditEvent_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiRequestAuditEvent_requestId_eventType_key"
ON "AiRequestAuditEvent"("requestId", "eventType");

CREATE INDEX "AiRequestAuditEvent_entityId_requestId_createdAt_idx"
ON "AiRequestAuditEvent"("entityId", "requestId", "createdAt");

CREATE INDEX "AiRequestAuditEvent_entityId_createdAt_idx"
ON "AiRequestAuditEvent"("entityId", "createdAt");

CREATE FUNCTION "AiRequestAuditEvent_immutable"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SAFE_AI_AUDIT_EVENT_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AiRequestAuditEvent_immutable_update"
BEFORE UPDATE OR DELETE ON "AiRequestAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "AiRequestAuditEvent_immutable"();
