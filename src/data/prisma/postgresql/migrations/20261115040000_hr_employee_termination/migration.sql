ALTER TABLE "Employee" ADD COLUMN "terminatedAt" TIMESTAMP(3);

CREATE TABLE "EmployeeEmploymentEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousTerminatedAt" TIMESTAMP(3),
    "newTerminatedAt" TIMESTAMP(3),
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeEmploymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeEmploymentEvent_employeeId_createdAt_idx" ON "EmployeeEmploymentEvent"("employeeId", "createdAt");
ALTER TABLE "EmployeeEmploymentEvent" ADD CONSTRAINT "EmployeeEmploymentEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
