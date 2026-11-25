CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Equipment_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Equipment_entityId_assetTag_key"
  ON "Equipment"("entityId", "assetTag");
CREATE UNIQUE INDEX "Equipment_id_entityId_key"
  ON "Equipment"("id", "entityId");
CREATE INDEX "Equipment_entityId_status_name_idx"
  ON "Equipment"("entityId", "status", "name");

CREATE TABLE "MaintenanceWorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceWorkOrder_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceWorkOrder_equipmentId_fkey"
      FOREIGN KEY ("equipmentId", "entityId") REFERENCES "Equipment" ("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MaintenanceWorkOrder_entityId_status_scheduledAt_idx"
  ON "MaintenanceWorkOrder"("entityId", "status", "scheduledAt");
CREATE INDEX "MaintenanceWorkOrder_equipmentId_scheduledAt_idx"
  ON "MaintenanceWorkOrder"("equipmentId", "scheduledAt");
