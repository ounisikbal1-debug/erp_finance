ALTER TABLE "Equipment" ADD COLUMN "isVehicle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Equipment" ADD COLUMN "vehicleRegistrationNumber" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "vehicleOdometerKm" INTEGER;
ALTER TABLE "Equipment" ADD COLUMN "vehicleFuelType" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "vehicleInsuranceExpiry" DATETIME;
ALTER TABLE "Equipment" ADD COLUMN "vehicleNextServiceAt" DATETIME;
ALTER TABLE "Equipment" ADD COLUMN "vehicleNextServiceOdometerKm" INTEGER;

CREATE UNIQUE INDEX "Employee_id_entityId_key" ON "Employee"("id", "entityId");
CREATE UNIQUE INDEX "Equipment_entityId_vehicleRegistrationNumber_key"
  ON "Equipment"("entityId", "vehicleRegistrationNumber");
CREATE INDEX "vehicle_due_date_idx"
  ON "Equipment"("entityId", "isVehicle", "vehicleNextServiceAt");
CREATE INDEX "vehicle_due_odometer_idx"
  ON "Equipment"("entityId", "isVehicle", "vehicleNextServiceOdometerKm");

CREATE TABLE "EquipmentVehicleAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentVehicleAssignment_equipmentId_entityId_fkey"
    FOREIGN KEY ("equipmentId", "entityId") REFERENCES "Equipment"("id", "entityId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EquipmentVehicleAssignment_employeeId_entityId_fkey"
    FOREIGN KEY ("employeeId", "entityId") REFERENCES "Employee"("id", "entityId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentVehicleAssignment_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EquipmentVehicleAssignment_equipmentId_entityId_key"
  ON "EquipmentVehicleAssignment"("equipmentId", "entityId");
CREATE INDEX "EquipmentVehicleAssignment_entityId_employeeId_idx"
  ON "EquipmentVehicleAssignment"("entityId", "employeeId");
