CREATE TABLE "EmployeeDocumentFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByUsername" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeDocumentFile_documentId_key" ON "EmployeeDocumentFile"("documentId");
CREATE UNIQUE INDEX "EmployeeDocumentFile_storageKey_key" ON "EmployeeDocumentFile"("storageKey");
CREATE INDEX "EmployeeDocumentFile_uploadedAt_idx" ON "EmployeeDocumentFile"("uploadedAt");
