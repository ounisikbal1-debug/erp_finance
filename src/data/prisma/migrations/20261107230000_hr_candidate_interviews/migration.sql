CREATE TABLE "CandidateInterview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CandidateInterviewEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateInterviewEvent_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "CandidateInterview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CandidateInterview_applicationId_status_idx" ON "CandidateInterview"("applicationId", "status");
CREATE INDEX "CandidateInterview_scheduledAt_idx" ON "CandidateInterview"("scheduledAt");
CREATE INDEX "CandidateInterviewEvent_interviewId_createdAt_idx" ON "CandidateInterviewEvent"("interviewId", "createdAt");
