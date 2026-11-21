CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "archivedByUsername" TEXT,
    "archiveNote" TEXT,
    CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EmployeeDocumentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmployeeDocument_employeeId_status_idx" ON "EmployeeDocument"("employeeId", "status");
CREATE INDEX "EmployeeDocument_employeeId_validUntil_idx" ON "EmployeeDocument"("employeeId", "validUntil");
CREATE INDEX "EmployeeDocumentEvent_documentId_createdAt_idx" ON "EmployeeDocumentEvent"("documentId", "createdAt");
