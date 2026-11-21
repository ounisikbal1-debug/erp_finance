CREATE TABLE "AdminUserEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousRole" TEXT,
    "nextRole" TEXT NOT NULL,
    "previousEntityId" TEXT,
    "nextEntityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AdminUserEvent_targetUserId_createdAt_idx" ON "AdminUserEvent"("targetUserId", "createdAt");
CREATE INDEX "AdminUserEvent_createdAt_idx" ON "AdminUserEvent"("createdAt");
