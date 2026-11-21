import prisma from '../../../core/models/prisma';
import { isUniqueConstraintViolation } from './payslip-uniqueness';
import { HrRequestError } from './errors';
import {
  validateEmployeeDocumentArchiveNote,
  validateEmployeeDocumentInput,
  validateEmployeeDocumentUpdate,
} from './employee-documents';
import {
  removePrivateHrDocument,
  validateHrDocumentFile,
  writePrivateHrDocument,
} from './employee-document-storage';
import { validateExpenseClaimDecision, validateExpenseClaimInput } from './expense-claims';
import { validateInterviewSchedule, validateInterviewStatus } from './interviews';
import {
  validateCandidateApplicationInput,
  validateCandidateStatus,
  validateRecruitmentPositionInput,
} from './recruitment';

export interface HrWorkflowActor {
  id: string;
  username: string;
}

const employeeSummary = { id: true, empId: true, firstName: true, lastName: true } as const;
const eventOrder = { createdAt: 'asc' as const };
const employeeDocumentFileSummary = {
  select: {
    mimeType: true,
    sizeBytes: true,
    uploadedAt: true,
    uploadedByUsername: true,
  },
} as const;

export class HrWorkflowService {
  static async listEmployeeDocuments(entityId: string) {
    return prisma.employeeDocument.findMany({
      where: { employee: { entityId } },
      include: {
        employee: { select: employeeSummary },
        file: employeeDocumentFileSummary,
        events: { orderBy: eventOrder },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async uploadEmployeeDocumentFile(
    documentId: string,
    entityId: string,
    actor: HrWorkflowActor,
    data: Buffer,
    mimeTypeValue: unknown,
  ) {
    const file = validateHrDocumentFile(data, mimeTypeValue);
    const current = await prisma.employeeDocument.findFirst({
      where: { id: documentId, employee: { entityId } },
      select: { id: true, status: true, file: { select: { id: true } } },
    });
    if (!current) throw new HrRequestError('Document RH introuvable pour cette société.', 404);
    if (current.status !== 'ACTIVE') {
      throw new HrRequestError('Un fichier ne peut être ajouté qu’à un document RH actif.', 409);
    }
    if (current.file) throw new HrRequestError('Un fichier est déjà associé à ce document RH.', 409);

    const storageKey = await writePrivateHrDocument(data);
    try {
      return await prisma.$transaction(async (tx) => {
        const latest = await tx.employeeDocument.findFirst({
          where: { id: documentId, employee: { entityId } },
          select: { id: true, status: true, file: { select: { id: true } } },
        });
        if (!latest) throw new HrRequestError('Document RH introuvable pour cette société.', 404);
        if (latest.status !== 'ACTIVE') {
          throw new HrRequestError('Un fichier ne peut être ajouté qu’à un document RH actif.', 409);
        }
        if (latest.file) throw new HrRequestError('Un fichier est déjà associé à ce document RH.', 409);
        await tx.employeeDocumentFile.create({
          data: {
            documentId,
            storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            uploadedByUserId: actor.id,
            uploadedByUsername: actor.username,
          },
        });
        await tx.employeeDocumentEvent.create({
          data: {
            documentId,
            action: 'FILE_UPLOADED',
            actorUserId: actor.id,
            actorUsername: actor.username,
            note: `Fichier privé ajouté (${file.mimeType}, ${file.sizeBytes} octets).`,
          },
        });
        return tx.employeeDocument.findFirst({
          where: { id: documentId, employee: { entityId } },
          include: {
            employee: { select: employeeSummary },
            file: employeeDocumentFileSummary,
            events: { orderBy: eventOrder },
          },
        });
      });
    } catch (error) {
      try {
        await removePrivateHrDocument(storageKey);
      } catch (cleanupError) {
        console.error('Échec du nettoyage après l’échec d’un téléversement RH:', cleanupError);
      }
      if (isUniqueConstraintViolation(error)) {
        throw new HrRequestError('Un fichier a été ajouté simultanément à ce document RH.', 409);
      }
      throw error;
    }
  }

  static async getEmployeeDocumentFile(documentId: string, entityId: string) {
    const document = await prisma.employeeDocument.findFirst({
      where: { id: documentId, employee: { entityId } },
      select: {
        id: true,
        file: { select: { storageKey: true, mimeType: true, sizeBytes: true, sha256: true } },
      },
    });
    if (!document) throw new HrRequestError('Document RH introuvable pour cette société.', 404);
    if (!document.file) throw new HrRequestError('Aucun fichier n’est associé à ce document RH.', 404);
    return document.file;
  }

  static async createEmployeeDocument(value: unknown, entityId: string, actor: HrWorkflowActor) {
    const document = validateEmployeeDocumentInput(value);
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: document.employeeId, entityId },
        select: { id: true },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société.', 404);
      return tx.employeeDocument.create({
        data: {
          employeeId: employee.id,
          category: document.category,
          title: document.title,
          validFrom: document.validFrom,
          validUntil: document.validUntil,
          status: 'ACTIVE',
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          events: {
            create: {
              action: 'CREATED',
              actorUserId: actor.id,
              actorUsername: actor.username,
              note: 'Métadonnées enregistrées; aucun fichier n’est stocké dans SAFE.',
            },
          },
        },
        include: {
          employee: { select: employeeSummary },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async archiveEmployeeDocument(
    documentId: string,
    entityId: string,
    actor: HrWorkflowActor,
    noteValue: unknown,
  ) {
    const note = validateEmployeeDocumentArchiveNote(noteValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.employeeDocument.findFirst({
        where: { id: documentId, employee: { entityId } },
        select: { id: true, status: true },
      });
      if (!current) throw new HrRequestError('Document RH introuvable pour cette société.', 404);
      if (current.status !== 'ACTIVE') {
        throw new HrRequestError('Seul un document actif peut être archivé.', 409);
      }
      const archivedAt = new Date();
      const changed = await tx.employeeDocument.updateMany({
        where: { id: documentId, status: 'ACTIVE', employee: { entityId } },
        data: {
          status: 'ARCHIVED',
          archivedAt,
          archivedByUserId: actor.id,
          archivedByUsername: actor.username,
          archiveNote: note,
        },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('Le document a changé pendant son archivage; rechargez-le.', 409);
      }
      await tx.employeeDocumentEvent.create({
        data: {
          documentId,
          action: 'ARCHIVED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note,
        },
      });
      return tx.employeeDocument.findFirst({
        where: { id: documentId, employee: { entityId } },
        include: {
          employee: { select: employeeSummary },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async updateEmployeeDocument(
    documentId: string,
    value: unknown,
    entityId: string,
    actor: HrWorkflowActor,
  ) {
    const update = validateEmployeeDocumentUpdate(value);
    return prisma.$transaction(async (tx) => {
      const current = await tx.employeeDocument.findFirst({
        where: { id: documentId, employee: { entityId } },
        select: { id: true, status: true },
      });
      if (!current) throw new HrRequestError('Document RH introuvable pour cette société.', 404);
      if (current.status !== 'ACTIVE') {
        throw new HrRequestError('Seul un document actif peut être modifié.', 409);
      }
      const changed = await tx.employeeDocument.updateMany({
        where: { id: documentId, status: 'ACTIVE', employee: { entityId } },
        data: {
          category: update.category,
          title: update.title,
          validFrom: update.validFrom,
          validUntil: update.validUntil,
        },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('Le document a changé pendant sa modification; rechargez-le.', 409);
      }
      await tx.employeeDocumentEvent.create({
        data: {
          documentId,
          action: 'UPDATED',
          actorUserId: actor.id,
          actorUsername: actor.username,
          note: update.reason,
        },
      });
      return tx.employeeDocument.findFirst({
        where: { id: documentId, employee: { entityId } },
        include: {
          employee: { select: employeeSummary },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async listRecruitmentPositions(entityId: string) {
    return prisma.recruitmentPosition.findMany({
      where: { entityId },
      include: {
        applications: {
          include: {
            events: { orderBy: eventOrder },
            interviews: { include: { events: { orderBy: eventOrder } }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }] },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  static async createRecruitmentPosition(value: unknown, entityId: string, actor: HrWorkflowActor) {
    const position = validateRecruitmentPositionInput(value);
    return prisma.recruitmentPosition.create({
      data: {
        entityId,
        title: position.title,
        status: 'OPEN',
        createdByUserId: actor.id,
        createdByUsername: actor.username,
      },
    });
  }

  static async closeRecruitmentPosition(positionId: string, entityId: string, actor: HrWorkflowActor) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.recruitmentPosition.findFirst({
        where: { id: positionId, entityId },
        select: { id: true, status: true },
      });
      if (!current) throw new HrRequestError('Poste introuvable pour cette société.', 404);
      if (current.status !== 'OPEN') throw new HrRequestError('Seul un poste ouvert peut être clôturé.', 409);
      const changed = await tx.recruitmentPosition.updateMany({
        where: { id: positionId, entityId, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedByUserId: actor.id,
          closedByUsername: actor.username,
        },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('Le poste a changé pendant sa clôture; rechargez-le.', 409);
      }
      return tx.recruitmentPosition.findFirst({
        where: { id: positionId, entityId },
        include: {
          applications: {
            include: {
              events: { orderBy: eventOrder },
              interviews: { include: { events: { orderBy: eventOrder } }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }] },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
    });
  }

  static async createCandidateApplication(value: unknown, entityId: string, actor: HrWorkflowActor) {
    const application = validateCandidateApplicationInput(value);
    try {
      return await prisma.$transaction(async (tx) => {
        const position = await tx.recruitmentPosition.findFirst({
          where: { id: application.positionId, entityId },
          select: { id: true, status: true },
        });
        if (!position) throw new HrRequestError('Poste introuvable pour cette société.', 404);
        if (position.status !== 'OPEN') throw new HrRequestError('Les candidatures sont clôturées pour ce poste.', 409);
        return tx.candidateApplication.create({
          data: {
            positionId: position.id,
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            status: 'RECEIVED',
            createdByUserId: actor.id,
            createdByUsername: actor.username,
            events: {
              create: {
                action: 'SUBMITTED',
                statusFrom: null,
                statusTo: 'RECEIVED',
                actorUserId: actor.id,
                actorUsername: actor.username,
              },
            },
          },
          include: { events: { orderBy: eventOrder } },
        });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new HrRequestError('Une candidature existe déjà pour cette adresse sur ce poste.', 409);
      }
      throw error;
    }
  }

  static async changeCandidateStatus(
    applicationId: string,
    entityId: string,
    actor: HrWorkflowActor,
    statusValue: unknown,
  ) {
    const status = validateCandidateStatus(statusValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.candidateApplication.findFirst({
        where: { id: applicationId, position: { entityId } },
        select: { id: true, status: true, anonymizedAt: true },
      });
      if (!current) throw new HrRequestError('Candidature introuvable pour cette société.', 404);
      if (current.anonymizedAt) throw new HrRequestError('Une candidature anonymisée ne peut plus être modifiée.', 409);
      if (current.status === status) throw new HrRequestError('La candidature possède déjà ce statut.', 409);
      const changed = await tx.candidateApplication.updateMany({
        where: { id: applicationId, status: current.status, anonymizedAt: null, position: { entityId } },
        data: { status },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('La candidature a changé; rechargez-la avant de la modifier.', 409);
      }
      await tx.candidateApplicationEvent.create({
        data: {
          applicationId,
          action: 'STATUS_CHANGED',
          statusFrom: current.status,
          statusTo: status,
          actorUserId: actor.id,
          actorUsername: actor.username,
        },
      });
      return tx.candidateApplication.findFirst({
        where: { id: applicationId, position: { entityId } },
        include: { events: { orderBy: eventOrder } },
      });
    });
  }

  static async anonymizeCandidateApplication(applicationId: string, entityId: string, actor: HrWorkflowActor) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.candidateApplication.findFirst({
        where: { id: applicationId, position: { entityId } },
        select: { id: true, status: true, anonymizedAt: true },
      });
      if (!current) throw new HrRequestError('Candidature introuvable pour cette société.', 404);
      if (current.anonymizedAt) throw new HrRequestError('La candidature est déjà anonymisée.', 409);
      const changed = await tx.candidateApplication.updateMany({
        where: { id: applicationId, anonymizedAt: null, position: { entityId } },
        data: {
          firstName: null,
          lastName: null,
          email: null,
          anonymizedAt: new Date(),
          anonymizedByUserId: actor.id,
          anonymizedByUsername: actor.username,
        },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('La candidature a changé; rechargez-la avant de l’anonymiser.', 409);
      }
      await tx.candidateApplicationEvent.create({
        data: {
          applicationId,
          action: 'ANONYMIZED',
          statusFrom: current.status,
          statusTo: current.status,
          actorUserId: actor.id,
          actorUsername: actor.username,
        },
      });
      return tx.candidateApplication.findFirst({
        where: { id: applicationId, position: { entityId } },
        include: { events: { orderBy: eventOrder } },
      });
    });
  }

  static async listCandidateInterviews(entityId: string) {
    return prisma.candidateInterview.findMany({
      where: { application: { position: { entityId } } },
      include: {
        application: { include: { position: { select: { id: true, title: true } } } },
        events: { orderBy: eventOrder },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  static async scheduleCandidateInterview(
    applicationId: string,
    entityId: string,
    actor: HrWorkflowActor,
    scheduledAtValue: unknown,
  ) {
    const scheduledAt = validateInterviewSchedule(scheduledAtValue);
    return prisma.$transaction(async (tx) => {
      const application = await tx.candidateApplication.findFirst({
        where: { id: applicationId, position: { entityId } },
        select: { id: true, anonymizedAt: true },
      });
      if (!application) throw new HrRequestError('Candidature introuvable pour cette société.', 404);
      if (application.anonymizedAt) {
        throw new HrRequestError('Aucun nouvel entretien ne peut être planifié pour une candidature anonymisée.', 409);
      }
      return tx.candidateInterview.create({
        data: {
          applicationId: application.id,
          scheduledAt,
          status: 'SCHEDULED',
          createdByUserId: actor.id,
          createdByUsername: actor.username,
          events: {
            create: {
              action: 'SCHEDULED',
              statusFrom: null,
              statusTo: 'SCHEDULED',
              actorUserId: actor.id,
              actorUsername: actor.username,
            },
          },
        },
        include: {
          application: { include: { position: { select: { id: true, title: true } } } },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async changeCandidateInterviewStatus(
    interviewId: string,
    entityId: string,
    actor: HrWorkflowActor,
    statusValue: unknown,
  ) {
    const status = validateInterviewStatus(statusValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.candidateInterview.findFirst({
        where: { id: interviewId, application: { position: { entityId } } },
        select: { id: true, status: true },
      });
      if (!current) throw new HrRequestError('Entretien introuvable pour cette société.', 404);
      if (current.status !== 'SCHEDULED') {
        throw new HrRequestError('Seul un entretien planifié peut être terminé ou annulé.', 409);
      }
      if (status === 'SCHEDULED') throw new HrRequestError('Le statut de l’entretien est déjà planifié.', 409);
      const changed = await tx.candidateInterview.updateMany({
        where: { id: interviewId, status: 'SCHEDULED', application: { position: { entityId } } },
        data: { status },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('L’entretien a changé; rechargez-le avant de le modifier.', 409);
      }
      await tx.candidateInterviewEvent.create({
        data: {
          interviewId,
          action: status,
          statusFrom: current.status,
          statusTo: status,
          actorUserId: actor.id,
          actorUsername: actor.username,
        },
      });
      return tx.candidateInterview.findFirst({
        where: { id: interviewId, application: { position: { entityId } } },
        include: {
          application: { include: { position: { select: { id: true, title: true } } } },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async listExpenseClaims(entityId: string) {
    return prisma.employeeExpenseClaim.findMany({
      where: { employee: { entityId } },
      include: {
        employee: { select: employeeSummary },
        events: { orderBy: eventOrder },
      },
      orderBy: [{ expenseDate: 'desc' }, { submittedAt: 'desc' }],
    });
  }

  static async listExpenseClaimEmployees(entityId: string) {
    return prisma.employee.findMany({
      where: { entityId },
      select: employeeSummary,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
  }

  static async createExpenseClaim(value: unknown, entityId: string, actor: HrWorkflowActor) {
    const claim = validateExpenseClaimInput(value);
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: claim.employeeId, entityId },
        select: { id: true },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société.', 404);
      return tx.employeeExpenseClaim.create({
        data: {
          employeeId: employee.id,
          category: claim.category,
          expenseDate: claim.expenseDate,
          amount: claim.amount,
          currency: claim.currency,
          status: 'TO_REVIEW',
          submittedByUserId: actor.id,
          submittedByUsername: actor.username,
          events: {
            create: {
              action: 'SUBMITTED',
              statusFrom: null,
              statusTo: 'TO_REVIEW',
              actorUserId: actor.id,
              actorUsername: actor.username,
            },
          },
        },
        include: {
          employee: { select: employeeSummary },
          events: { orderBy: eventOrder },
        },
      });
    });
  }

  static async reviewExpenseClaim(
    claimId: string,
    entityId: string,
    actor: HrWorkflowActor,
    decisionValue: unknown,
  ) {
    const decision = validateExpenseClaimDecision(decisionValue);
    return prisma.$transaction(async (tx) => {
      const current = await tx.employeeExpenseClaim.findFirst({
        where: { id: claimId, employee: { entityId } },
        select: { id: true, status: true, submittedByUserId: true },
      });
      if (!current) throw new HrRequestError('Note de frais introuvable pour cette société.', 404);
      if (current.submittedByUserId === actor.id) {
        throw new HrRequestError('Une note de frais doit être examinée par une autre personne.', 403);
      }
      if (current.status !== 'TO_REVIEW') {
        throw new HrRequestError('Seule une note de frais en attente peut être examinée.', 409);
      }
      const changed = await tx.employeeExpenseClaim.updateMany({
        where: {
          id: claimId,
          status: 'TO_REVIEW',
          submittedByUserId: { not: actor.id },
          employee: { entityId },
        },
        data: {
          status: decision,
          reviewedByUserId: actor.id,
          reviewedByUsername: actor.username,
          reviewedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new HrRequestError('La note de frais a changé pendant son examen; rechargez-la.', 409);
      }
      await tx.employeeExpenseClaimEvent.create({
        data: {
          expenseClaimId: claimId,
          action: decision,
          statusFrom: current.status,
          statusTo: decision,
          actorUserId: actor.id,
          actorUsername: actor.username,
        },
      });
      return tx.employeeExpenseClaim.findFirst({
        where: { id: claimId, employee: { entityId } },
        include: {
          employee: { select: employeeSummary },
          events: { orderBy: eventOrder },
        },
      });
    });
  }
}

export default HrWorkflowService;
