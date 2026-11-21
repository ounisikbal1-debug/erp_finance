CREATE TABLE "QualityFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" DATETIME NOT NULL,
    "dueAt" DATETIME,
    "owner" TEXT NOT NULL,
    "rootCause" TEXT,
    "containmentAction" TEXT,
    "closureNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityFinding_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityFinding_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "QualityFinding_entityId_status_severity_dueAt_idx"
  ON "QualityFinding"("entityId", "status", "severity", "dueAt");
CREATE INDEX "QualityFinding_equipmentId_createdAt_idx"
  ON "QualityFinding"("equipmentId", "createdAt");

CREATE TABLE "QualityAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "verificationNotes" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityAction_findingId_fkey"
      FOREIGN KEY ("findingId") REFERENCES "QualityFinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QualityAction_findingId_status_dueAt_idx"
  ON "QualityAction"("findingId", "status", "dueAt");
