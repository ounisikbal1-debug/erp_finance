CREATE TABLE "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "projectCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "budgetAmount" REAL,
  "contractAmount" REAL,
  "startAt" DATETIME,
  "endAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Project_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "dueAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProjectTask_projectId_entityId_fkey"
    FOREIGN KEY ("projectId", "entityId") REFERENCES "Project"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMilestone_projectId_entityId_fkey"
    FOREIGN KEY ("projectId", "entityId") REFERENCES "Project"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectCost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "sourceReference" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectCost_projectId_entityId_fkey"
    FOREIGN KEY ("projectId", "entityId") REFERENCES "Project"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Project_id_entityId_key" ON "Project"("id", "entityId");
CREATE UNIQUE INDEX "Project_entityId_projectCode_key" ON "Project"("entityId", "projectCode");
CREATE INDEX "Project_entityId_status_startAt_idx" ON "Project"("entityId", "status", "startAt");
CREATE INDEX "ProjectTask_entityId_projectId_status_dueAt_idx"
  ON "ProjectTask"("entityId", "projectId", "status", "dueAt");
CREATE INDEX "ProjectMilestone_entityId_projectId_dueAt_idx"
  ON "ProjectMilestone"("entityId", "projectId", "dueAt");
CREATE INDEX "ProjectCost_entityId_projectId_occurredAt_idx"
  ON "ProjectCost"("entityId", "projectId", "occurredAt");
