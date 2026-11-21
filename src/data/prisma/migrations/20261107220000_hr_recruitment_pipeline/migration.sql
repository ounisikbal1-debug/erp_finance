CREATE TABLE "RecruitmentPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closedByUserId" TEXT,
    "closedByUsername" TEXT,
    CONSTRAINT "RecruitmentPosition_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymizedAt" DATETIME,
    "anonymizedByUserId" TEXT,
    "anonymizedByUsername" TEXT,
    CONSTRAINT "CandidateApplication_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "RecruitmentPosition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CandidateApplicationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RecruitmentPosition_entityId_status_idx" ON "RecruitmentPosition"("entityId", "status");
CREATE UNIQUE INDEX "CandidateApplication_positionId_email_key" ON "CandidateApplication"("positionId", "email");
CREATE INDEX "CandidateApplication_positionId_status_idx" ON "CandidateApplication"("positionId", "status");
CREATE INDEX "CandidateApplicationEvent_applicationId_createdAt_idx" ON "CandidateApplicationEvent"("applicationId", "createdAt");
