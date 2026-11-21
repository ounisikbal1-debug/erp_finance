import type { Prisma } from '@prisma/client';

export type StockReservationTransaction = Pick<Prisma.TransactionClient, '$executeRaw'>;

export function reserveMaterialStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "Material"
    SET "reservedQuantity" = ROUND(("reservedQuantity" + ${quantity}) * 1000) / 1000
    WHERE "id" = ${materialId}
      AND "entityId" = ${entityId}
      AND ("quantity" - "reservedQuantity") >= ${quantity}
  `;
}

export function reserveWarehouseStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  warehouseId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "MaterialWarehouseStock"
    SET "reservedQuantity" = ROUND(("reservedQuantity" + ${quantity}) * 1000) / 1000
    WHERE "entityId" = ${entityId}
      AND "materialId" = ${materialId}
      AND "warehouseId" = ${warehouseId}
      AND ("quantity" - "reservedQuantity") >= ${quantity}
  `;
}

export function releaseMaterialReservation(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "Material"
    SET "reservedQuantity" = ROUND(("reservedQuantity" - ${quantity}) * 1000) / 1000
    WHERE "id" = ${materialId}
      AND "entityId" = ${entityId}
      AND "reservedQuantity" >= ${quantity}
  `;
}

export function releaseWarehouseReservation(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  warehouseId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "MaterialWarehouseStock"
    SET "reservedQuantity" = ROUND(("reservedQuantity" - ${quantity}) * 1000) / 1000
    WHERE "entityId" = ${entityId}
      AND "materialId" = ${materialId}
      AND "warehouseId" = ${warehouseId}
      AND "reservedQuantity" >= ${quantity}
  `;
}

export function consumeReservedMaterialStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "Material"
    SET "quantity" = ROUND(("quantity" - ${quantity}) * 1000) / 1000,
        "reservedQuantity" = ROUND(("reservedQuantity" - ${quantity}) * 1000) / 1000
    WHERE "id" = ${materialId}
      AND "entityId" = ${entityId}
      AND "quantity" >= ${quantity}
      AND "reservedQuantity" >= ${quantity}
  `;
}

export function consumeReservedWarehouseStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  warehouseId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "MaterialWarehouseStock"
    SET "quantity" = ROUND(("quantity" - ${quantity}) * 1000) / 1000,
        "reservedQuantity" = ROUND(("reservedQuantity" - ${quantity}) * 1000) / 1000
    WHERE "entityId" = ${entityId}
      AND "materialId" = ${materialId}
      AND "warehouseId" = ${warehouseId}
      AND "quantity" >= ${quantity}
      AND "reservedQuantity" >= ${quantity}
  `;
}

export function consumeAvailableMaterialStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "Material"
    SET "quantity" = ROUND(("quantity" - ${quantity}) * 1000) / 1000
    WHERE "id" = ${materialId}
      AND "entityId" = ${entityId}
      AND ("quantity" - "reservedQuantity") >= ${quantity}
  `;
}

export function consumeUnallocatedMaterialStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  requiredTotal: number,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "Material"
    SET "quantity" = ROUND(("quantity" - ${quantity}) * 1000) / 1000
    WHERE "id" = ${materialId}
      AND "entityId" = ${entityId}
      AND "quantity" >= ${requiredTotal}
  `;
}

export function consumeAvailableWarehouseStock(
  transaction: StockReservationTransaction,
  entityId: string,
  materialId: string,
  warehouseId: string,
  quantity: number,
): Promise<number> {
  return transaction.$executeRaw`
    UPDATE "MaterialWarehouseStock"
    SET "quantity" = ROUND(("quantity" - ${quantity}) * 1000) / 1000
    WHERE "entityId" = ${entityId}
      AND "materialId" = ${materialId}
      AND "warehouseId" = ${warehouseId}
      AND ("quantity" - "reservedQuantity") >= ${quantity}
  `;
}
