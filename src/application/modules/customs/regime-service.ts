import type { PrismaClient } from '@prisma/client';
import prisma from '../../../data/prisma/client';
import {
  CustomsRegimeError,
  validateCustomsBondInput,
  validateCustomsBondReleaseInput,
  validateCustomsRegimeInput,
  validateCustomsRegimeStatus,
  validateCustomsStockMovementInput,
  validateCustomsStockSheetInput,
} from './regimes';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export class CustomsRegimeService {
  constructor(private readonly database: PrismaClient = prisma) {}

  list(entityId: string) {
    return this.database.customsDutyRegime.findMany({
      where: { entityId },
      include: {
        stockSheets: { include: { movements: { orderBy: { occurredAt: 'asc' } } } },
        bonds: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createRegime(entityId: string, value: unknown) {
    const input = validateCustomsRegimeInput(value);
    try {
      return await this.database.customsDutyRegime.create({
        data: { ...input, entityId },
        include: { stockSheets: true, bonds: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new CustomsRegimeError('Cette référence de régime existe déjà dans cette entité.', 409);
      }
      throw error;
    }
  }

  async updateRegimeStatus(entityId: string, regimeId: string, value: unknown) {
    const status = validateCustomsRegimeStatus(value);
    const result = await this.database.customsDutyRegime.updateMany({
      where: { id: regimeId, entityId },
      data: { status },
    });
    if (result.count !== 1) throw new CustomsRegimeError('Régime douanier introuvable pour cette entité.', 404);
    return this.database.customsDutyRegime.findFirst({
      where: { id: regimeId, entityId },
      include: { stockSheets: true, bonds: true },
    });
  }

  async createStockSheet(entityId: string, regimeId: string, value: unknown) {
    const input = validateCustomsStockSheetInput(value);
    const regime = await this.database.customsDutyRegime.findFirst({
      where: { id: regimeId, entityId },
      select: { id: true },
    });
    if (!regime) throw new CustomsRegimeError('Régime douanier introuvable pour cette entité.', 404);
    try {
      return await this.database.customsStockSheet.create({
        data: {
          ...input,
          regime: { connect: { id_entityId: { id: regimeId, entityId } } },
        },
        include: { movements: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new CustomsRegimeError('Cette référence de fiche existe déjà pour ce régime.', 409);
      }
      throw error;
    }
  }

  async addStockMovement(entityId: string, stockSheetId: string, value: unknown) {
    const input = validateCustomsStockMovementInput(value);
    const stockSheet = await this.database.customsStockSheet.findFirst({
      where: { id: stockSheetId, entityId },
      select: { id: true },
    });
    if (!stockSheet) throw new CustomsRegimeError('Fiche de stock douanière introuvable pour cette entité.', 404);
    return this.database.customsStockMovement.create({
      data: {
        ...input,
        stockSheet: { connect: { id_entityId: { id: stockSheetId, entityId } } },
      },
    });
  }

  async createBond(entityId: string, regimeId: string, value: unknown) {
    const input = validateCustomsBondInput(value);
    const regime = await this.database.customsDutyRegime.findFirst({
      where: { id: regimeId, entityId },
      select: { id: true },
    });
    if (!regime) throw new CustomsRegimeError('Régime douanier introuvable pour cette entité.', 404);
    try {
      return await this.database.customsBond.create({
        data: {
          ...input,
          regime: { connect: { id_entityId: { id: regimeId, entityId } } },
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new CustomsRegimeError('Cette référence de caution existe déjà pour ce régime.', 409);
      }
      throw error;
    }
  }

  async releaseBond(entityId: string, regimeId: string, bondId: string, value: unknown) {
    const input = validateCustomsBondReleaseInput(value);
    const bond = await this.database.customsBond.findFirst({
      where: { id: bondId, regimeId, entityId },
      select: { id: true, status: true },
    });
    if (!bond) throw new CustomsRegimeError('Caution introuvable pour ce régime et cette entité.', 404);
    if (bond.status === 'RELEASED') throw new CustomsRegimeError('Cette caution est déjà enregistrée comme libérée.', 409);
    return this.database.customsBond.update({
      where: { id: bond.id },
      data: { ...input, status: 'RELEASED' },
    });
  }
}
