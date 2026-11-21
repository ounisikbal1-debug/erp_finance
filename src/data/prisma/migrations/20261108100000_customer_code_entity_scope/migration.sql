DROP INDEX "Customer_code_key";

CREATE UNIQUE INDEX "Customer_entityId_code_key" ON "Customer"("entityId", "code");
CREATE UNIQUE INDEX "Customer_entityId_id_key" ON "Customer"("entityId", "id");
