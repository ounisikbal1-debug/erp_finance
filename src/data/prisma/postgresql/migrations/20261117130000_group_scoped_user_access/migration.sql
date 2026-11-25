CREATE TABLE "ConsolidationGroupUserAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "countryCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidationGroupUserAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidationGroupUserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidationGroupUserAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsolidationGroupUserAccess_userId_groupId_countryCode_key" ON "ConsolidationGroupUserAccess"("userId", "groupId", "countryCode");
CREATE INDEX "ConsolidationGroupUserAccess_groupId_countryCode_role_idx" ON "ConsolidationGroupUserAccess"("groupId", "countryCode", "role");
