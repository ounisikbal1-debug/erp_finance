import prisma from '../../../core/models/prisma';
import { QualityRequestError } from './errors';
import {
  assertQualityActionTransition,
  assertQualityFindingTransition,
  isQualityActionStatus,
  isQualityStatus,
  validateQualityActionInput,
  validateQualityActionUpdate,
  validateQualityIssueInput,
  validateQualityIssueUpdate,
} from './validation';

const findingDetails = {
  actions: { orderBy: { createdAt: 'asc' as const } },
  equipment: { select: { id: true, assetTag: true, name: true, category: true, location: true } },
};

const actionDetails = {
  finding: true,
};

export class QualityService {
  static async listEquipment(entityId: string) {
    return prisma.equipment.findMany({
      where: { entityId, status: 'ACTIVE' },
      select: { id: true, assetTag: true, name: true, category: true, location: true, status: true },
      orderBy: [{ assetTag: 'asc' }],
    });
  }

  static async listFindings(entityId: string) {
    return prisma.qualityFinding.findMany({
      where: { entityId },
      include: findingDetails,
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async createFinding(input: unknown, entityId: string) {
    const data = validateQualityIssueInput(input);
    if (data.equipmentId) {
      const equipment = await prisma.equipment.findFirst({
        where: { id: data.equipmentId, entityId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!equipment) throw new QualityRequestError('Équipement actif introuvable pour cette société.', 404);
    }
    return prisma.qualityFinding.create({
      data: { ...data, entityId },
      include: findingDetails,
    });
  }

  static async updateFinding(id: string, input: unknown, entityId: string) {
    const update = validateQualityIssueUpdate(input);
    return prisma.$transaction(async (tx) => {
      const current = await tx.qualityFinding.findFirst({
        where: { id, entityId },
        include: findingDetails,
      });
      if (!current) throw new QualityRequestError('Non-conformité introuvable pour cette société.', 404);
      if (current.status === 'CLOSED' || current.status === 'CANCELLED') {
        throw new QualityRequestError('Le dossier est clôturé ou annulé et ne peut plus être modifié.', 409);
      }

      if (update.status && update.status !== current.status) {
        if (!isQualityStatus(current.status)) {
          throw new QualityRequestError('Statut de non-conformité enregistré inconnu.', 409);
        }
        assertQualityFindingTransition(current.status, update.status, {
          rootCause: update.rootCause === undefined ? current.rootCause : update.rootCause,
          closureNotes: update.closureNotes === undefined ? current.closureNotes : update.closureNotes,
          actions: current.actions,
        });
      }

      const detectedAt = current.detectedAt;
      const dueAt = update.dueAt === undefined ? current.dueAt : update.dueAt;
      if (dueAt && dueAt < detectedAt) {
        throw new QualityRequestError('L’échéance ne peut pas précéder la date de détection.', 400);
      }
      const source = update.source ?? current.source;
      const equipmentId = update.equipmentId === undefined ? current.equipmentId : update.equipmentId;
      if (source === 'EQUIPMENT') {
        if (!equipmentId) throw new QualityRequestError('Sélectionnez l’équipement concerné par cette non-conformité.', 400);
        const equipment = await tx.equipment.findFirst({
          where: { id: equipmentId, entityId },
          select: { id: true, status: true },
        });
        if (!equipment) throw new QualityRequestError('Équipement introuvable pour cette société.', 404);
        const associationChanged = update.source !== undefined || update.equipmentId !== undefined;
        if (associationChanged && equipment.status !== 'ACTIVE') {
          throw new QualityRequestError('Sélectionnez un équipement actif pour cette non-conformité.', 409);
        }
      } else if (update.equipmentId && source !== 'EQUIPMENT') {
        throw new QualityRequestError('Une référence équipement exige une origine « Équipement ».', 400);
      }
      if (source !== 'EQUIPMENT' && update.source !== undefined && update.equipmentId === undefined) {
        update.equipmentId = null;
      }
      const result = await tx.qualityFinding.updateMany({
        where: { id, entityId, status: current.status },
        data: update,
      });
      if (result.count !== 1) {
        throw new QualityRequestError('Le dossier a changé; rechargez puis réessayez.', 409);
      }
      const updated = await tx.qualityFinding.findFirst({
        where: { id, entityId },
        include: findingDetails,
      });
      if (!updated) throw new QualityRequestError('Le dossier a changé; rechargez puis réessayez.', 409);
      return updated;
    });
  }

  static async createAction(findingId: string, input: unknown, entityId: string) {
    const data = validateQualityActionInput(input);
    return prisma.$transaction(async (tx) => {
      const finding = await tx.qualityFinding.findFirst({
        where: { id: findingId, entityId },
        select: { id: true, status: true, detectedAt: true },
      });
      if (!finding) throw new QualityRequestError('Non-conformité introuvable pour cette société.', 404);
      if (finding.status === 'CLOSED' || finding.status === 'CANCELLED') {
        throw new QualityRequestError('Aucune action ne peut être ajoutée à un dossier clôturé ou annulé.', 409);
      }
      if (finding.status === 'VERIFYING') {
        throw new QualityRequestError('Repassez le dossier en « Actions requises » avant d’ajouter une action CAPA.', 409);
      }
      if (data.dueAt < finding.detectedAt) {
        throw new QualityRequestError('L’échéance de l’action ne peut pas précéder la détection.', 400);
      }
      return tx.qualityAction.create({
        data: { ...data, findingId },
        include: actionDetails,
      });
    });
  }

  static async updateAction(id: string, input: unknown, entityId: string) {
    const update = validateQualityActionUpdate(input);
    return prisma.$transaction(async (tx) => {
      const current = await tx.qualityAction.findFirst({
        where: { id, finding: { entityId } },
        include: actionDetails,
      });
      if (!current) throw new QualityRequestError('Action CAPA introuvable pour cette société.', 404);
      if (current.finding.status === 'CLOSED' || current.finding.status === 'CANCELLED') {
        throw new QualityRequestError('Le dossier associé est clôturé ou annulé.', 409);
      }
      if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
        throw new QualityRequestError('L’action est terminée ou annulée et ne peut plus être modifiée.', 409);
      }
      if (update.dueAt && update.dueAt < current.finding.detectedAt) {
        throw new QualityRequestError('L’échéance de l’action ne peut pas précéder la détection.', 400);
      }
      if (update.status && update.status !== current.status) {
        if (!isQualityActionStatus(current.status)) {
          throw new QualityRequestError('Statut d’action CAPA enregistré inconnu.', 409);
        }
        assertQualityActionTransition(current.status, update.status, update.verificationNotes === undefined
          ? current.verificationNotes
          : update.verificationNotes);
      }
      const result = await tx.qualityAction.updateMany({
        where: { id, findingId: current.findingId, status: current.status },
        data: {
          ...update,
          ...(update.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
      });
      if (result.count !== 1) {
        throw new QualityRequestError('L’action a changé; rechargez puis réessayez.', 409);
      }
      const updated = await tx.qualityAction.findFirst({
        where: { id, finding: { entityId } },
        include: actionDetails,
      });
      if (!updated) throw new QualityRequestError('L’action a changé; rechargez puis réessayez.', 409);
      return updated;
    });
  }
}

export default QualityService;
