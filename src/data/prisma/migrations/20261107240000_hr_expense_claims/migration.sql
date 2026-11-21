CREATE TABLE "EmployeeExpenseClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TO_REVIEW',
    "submittedByUserId" TEXT NOT NULL,
    "submittedByUsername" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedByUsername" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "EmployeeExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EmployeeExpenseClaimEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseClaimId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeExpenseClaimEvent_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "EmployeeExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmployeeExpenseClaim_employeeId_status_idx" ON "EmployeeExpenseClaim"("employeeId", "status");
CREATE INDEX "EmployeeExpenseClaim_employeeId_expenseDate_idx" ON "EmployeeExpenseClaim"("employeeId", "expenseDate");
CREATE INDEX "EmployeeExpenseClaimEvent_expenseClaimId_createdAt_idx" ON "EmployeeExpenseClaimEvent"("expenseClaimId", "createdAt");
