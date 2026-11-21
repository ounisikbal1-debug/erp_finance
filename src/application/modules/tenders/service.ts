import prisma from '../../../data/prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  TenderRequestError,
  validateTenderCautionInput,
  validateTenderCautionUpdate,
  validateTenderDocumentInput,
  validateTenderDocumentUpdate,
  validateTenderInput,
  validateTenderStatus,
} from './validation';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export class TenderService {
  constructor(private readonly database: PrismaClient = prisma) {}

  private async ensureTender(entityId: string, tenderId: string): Promise<void> {
    const tender = await this.database.tenderBid.findFirst({
      where: { id: tenderId, entityId },
      select: { id: true },
    });
    if (!tender) throw new TenderRequestError('Appel d’offres introuvable pour cette entité.', 404);
  }

  list(entityId: string) {
    return this.database.tenderBid.findMany({
      where: { entityId },
      include: {
        documents: { orderBy: [{ title: 'asc' }] },
        cautions: { orderBy: [{ createdAt: 'desc' }] },
      },
      orderBy: [{ submissionDeadline: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(entityId: string, value: unknown) {
    const input = validateTenderInput(value);
    try {
      return await this.database.tenderBid.create({
        data: { ...input, entityId },
        include: { documents: true, cautions: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new TenderRequestError('Cette référence d’appel d’offres existe déjà dans cette entité.', 409);
      }
      throw error;
    }
  }

  async updateStatus(entityId: string, tenderId: string, value: unknown) {
    const status = validateTenderStatus(value);
    const result = await this.database.tenderBid.updateMany({
      where: { id: tenderId, entityId },
      data: { status, outcomeAt: status === 'WON' || status === 'LOST' ? new Date() : null },
    });
    if (result.count !== 1) throw new TenderRequestError('Appel d’offres introuvable pour cette entité.', 404);
    return this.database.tenderBid.findFirst({
      where: { id: tenderId, entityId },
      include: { documents: true, cautions: true },
    });
  }

  async addDocument(entityId: string, tenderId: string, value: unknown) {
    const input = validateTenderDocumentInput(value);
    await this.ensureTender(entityId, tenderId);
    return this.database.tenderDocument.create({
      data: {
        ...input,
        tenderBid: { connect: { id_entityId: { id: tenderId, entityId } } },
      },
    });
  }

  async updateDocument(entityId: string, tenderId: string, documentId: string, value: unknown) {
    const input = validateTenderDocumentUpdate(value);
    const result = await this.database.tenderDocument.updateMany({
      where: { id: documentId, tenderBidId: tenderId, entityId },
      data: input,
    });
    if (result.count !== 1) throw new TenderRequestError('Pièce introuvable pour cet appel d’offres.', 404);
    return this.database.tenderDocument.findFirst({
      where: { id: documentId, tenderBidId: tenderId, entityId },
    });
  }

  async addCaution(entityId: string, tenderId: string, value: unknown) {
    const input = validateTenderCautionInput(value);
    await this.ensureTender(entityId, tenderId);
    return this.database.tenderCaution.create({
      data: {
        ...input,
        tenderBid: { connect: { id_entityId: { id: tenderId, entityId } } },
      },
    });
  }

  async updateCaution(entityId: string, tenderId: string, cautionId: string, value: unknown) {
    const input = validateTenderCautionUpdate(value);
    const result = await this.database.tenderCaution.updateMany({
      where: { id: cautionId, tenderBidId: tenderId, entityId },
      data: input,
    });
    if (result.count !== 1) throw new TenderRequestError('Caution introuvable pour cet appel d’offres.', 404);
    return this.database.tenderCaution.findFirst({
      where: { id: cautionId, tenderBidId: tenderId, entityId },
    });
  }
}
