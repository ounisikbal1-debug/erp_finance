ALTER TABLE "Employee" ADD COLUMN "terminatedAt" DATETIME;

CREATE TABLE "EmployeeEmploymentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousTerminatedAt" DATETIME,
    "newTerminatedAt" DATETIME,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeEmploymentEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "EmployeeEmploymentEvent_employeeId_createdAt_idx" ON "EmployeeEmploymentEvent"("employeeId", "createdAt");
