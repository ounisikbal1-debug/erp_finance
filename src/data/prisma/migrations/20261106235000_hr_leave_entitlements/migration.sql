CREATE TABLE "HrLeaveEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitlementDays" INTEGER NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedByUsername" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HrLeaveEntitlement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrLeaveEntitlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "HrLeaveEntitlementEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entitlementId" TEXT NOT NULL,
    "previousEntitlementDays" INTEGER,
    "nextEntitlementDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrLeaveEntitlementEvent_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "HrLeaveEntitlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HrLeaveEntitlement_employeeId_leaveType_year_key" ON "HrLeaveEntitlement"("employeeId", "leaveType", "year");
CREATE INDEX "HrLeaveEntitlement_entityId_year_leaveType_idx" ON "HrLeaveEntitlement"("entityId", "year", "leaveType");
CREATE INDEX "HrLeaveEntitlementEvent_entitlementId_createdAt_idx" ON "HrLeaveEntitlementEvent"("entitlementId", "createdAt");
