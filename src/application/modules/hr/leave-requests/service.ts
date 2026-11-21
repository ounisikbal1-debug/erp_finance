import prisma from '../../../../data/prisma/client';
import { HrRequestError } from '../errors';
import {
  calendarDaysInYearRange,
  validateHrLeaveDecision,
  validateHrLeaveEntitlement,
  validateHrLeaveYear,
  validateHrLeaveRequest,
} from './validation';

const leaveRequestInclude = {
  employee: { select: { id: true, empId: true, firstName: true, lastName: true, position: true } },
  requestedBy: { select: { id: true, username: true } },
  reviewedBy: { select: { id: true, username: true } },
};

export class HrLeaveRequestService {
  static async list(entityId: string) {
    return prisma.hrLeaveRequest.findMany({
      where: { entityId },
      include: leaveRequestInclude,
      orderBy: [{ status: 'asc' }, { startAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  static async listEntitlements(entityId: string, year: number) {
    const selectedYear = validateHrLeaveYear(year);
    const startAt = new Date(Date.UTC(selectedYear, 0, 1));
    const endAt = new Date(Date.UTC(selectedYear + 1, 0, 1) - 1);
    const [entitlements, requests] = await Promise.all([
      prisma.hrLeaveEntitlement.findMany({
        where: { entityId, year: selectedYear, leaveType: 'ANNUAL' },
        include: { employee: { select: { id: true, empId: true, firstName: true, lastName: true } } },
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
      }),
      prisma.hrLeaveRequest.findMany({
        where: {
          entityId,
          leaveType: 'ANNUAL',
          status: { in: ['PENDING', 'APPROVED'] },
          startAt: { lte: endAt },
          endAt: { gte: startAt },
        },
        select: { employeeId: true, status: true, startAt: true, endAt: true },
      }),
    ]);
    return entitlements.map((entitlement) => {
      const employeeRequests = requests.filter((request) => request.employeeId === entitlement.employeeId);
      const usedDays = employeeRequests
        .filter((request) => request.status === 'APPROVED')
        .reduce((sum, request) => sum + calendarDaysInYearRange(request.startAt, request.endAt, selectedYear), 0);
      const pendingDays = employeeRequests
        .filter((request) => request.status === 'PENDING')
        .reduce((sum, request) => sum + calendarDaysInYearRange(request.startAt, request.endAt, selectedYear), 0);
      return {
        ...entitlement,
        usedDays,
        pendingDays,
        availableDays: entitlement.entitlementDays - usedDays - pendingDays,
      };
    });
  }

  static async setEntitlement(value: unknown, entityId: string, actor: { id: string; username: string }) {
    const input = validateHrLeaveEntitlement(value);
    const dateStart = new Date(Date.UTC(input.year, 0, 1));
    const dateEnd = new Date(Date.UTC(input.year + 1, 0, 1) - 1);
    return prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id: input.employeeId, entityId },
        select: { id: true },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société.', 404);
      const [existing, requests] = await Promise.all([
        transaction.hrLeaveEntitlement.findUnique({
          where: {
            employeeId_leaveType_year: {
              employeeId: input.employeeId,
              leaveType: 'ANNUAL',
              year: input.year,
            },
          },
        }),
        transaction.hrLeaveRequest.findMany({
          where: {
            entityId,
            employeeId: input.employeeId,
            leaveType: 'ANNUAL',
            status: { in: ['PENDING', 'APPROVED'] },
            startAt: { lte: dateEnd },
            endAt: { gte: dateStart },
          },
          select: { startAt: true, endAt: true },
        }),
      ]);
      const committedDays = requests.reduce(
        (sum, request) => sum + calendarDaysInYearRange(request.startAt, request.endAt, input.year),
        0,
      );
      if (input.entitlementDays < committedDays) {
        throw new HrRequestError(
          `Le droit ne peut pas être inférieur aux ${committedDays} jour(s) déjà approuvé(s) ou en attente.`,
          409,
        );
      }
      const saved = await transaction.hrLeaveEntitlement.upsert({
        where: {
          employeeId_leaveType_year: {
            employeeId: input.employeeId,
            leaveType: 'ANNUAL',
            year: input.year,
          },
        },
        create: {
          entityId,
          employeeId: input.employeeId,
          leaveType: 'ANNUAL',
          year: input.year,
          entitlementDays: input.entitlementDays,
          policySource: input.policySource,
          effectiveFrom: input.effectiveFrom,
          updatedByUserId: actor.id,
          updatedByUsername: actor.username,
          updatedAt: new Date(),
        },
        update: {
          entitlementDays: input.entitlementDays,
          policySource: input.policySource,
          effectiveFrom: input.effectiveFrom,
          updatedByUserId: actor.id,
          updatedByUsername: actor.username,
          updatedAt: new Date(),
        },
      });
      await transaction.hrLeaveEntitlementEvent.create({
        data: {
          entitlementId: saved.id,
          previousEntitlementDays: existing?.entitlementDays ?? null,
          nextEntitlementDays: input.entitlementDays,
          policySource: input.policySource,
          effectiveFrom: input.effectiveFrom,
          reason: input.reason,
          actorUserId: actor.id,
          actorUsername: actor.username,
        },
      });
      return saved;
    });
  }

  static async create(value: unknown, entityId: string, requestedByUserId: string) {
    const input = validateHrLeaveRequest(value);
    return prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id: input.employeeId, entityId },
        select: { id: true },
      });
      if (!employee) throw new HrRequestError('Salarié introuvable pour cette société.', 404);
      const conflictingRequest = await transaction.hrLeaveRequest.findFirst({
        where: {
          entityId,
          employeeId: input.employeeId,
          status: { in: ['PENDING', 'APPROVED'] },
          startAt: { lte: input.endAt },
          endAt: { gte: input.startAt },
        },
        select: { id: true },
      });
      if (conflictingRequest) {
        throw new HrRequestError('Une demande en attente ou approuvée couvre déjà une partie de cette période.', 409);
      }
      if (input.leaveType === 'ANNUAL') {
        const years = Array.from(
          { length: input.endAt.getUTCFullYear() - input.startAt.getUTCFullYear() + 1 },
          (_, index) => input.startAt.getUTCFullYear() + index,
        );
        const firstYearStart = new Date(Date.UTC(years[0], 0, 1));
        const lastYearEnd = new Date(Date.UTC(years[years.length - 1] + 1, 0, 1) - 1);
        const [entitlements, reservations] = await Promise.all([
          transaction.hrLeaveEntitlement.findMany({
            where: { entityId, employeeId: input.employeeId, leaveType: 'ANNUAL', year: { in: years } },
            select: { year: true, entitlementDays: true },
          }),
          transaction.hrLeaveRequest.findMany({
            where: {
              entityId,
              employeeId: input.employeeId,
              leaveType: 'ANNUAL',
              status: { in: ['PENDING', 'APPROVED'] },
              startAt: { lte: lastYearEnd },
              endAt: { gte: firstYearStart },
            },
            select: { startAt: true, endAt: true },
          }),
        ]);
        for (const year of years) {
          const entitlement = entitlements.find((item) => item.year === year);
          if (!entitlement) {
            throw new HrRequestError(`Aucun droit annuel n’est configuré pour ${year}; contactez le responsable RH.`, 422);
          }
          const alreadyRequested = reservations.reduce(
            (sum, request) => sum + calendarDaysInYearRange(request.startAt, request.endAt, year),
            0,
          );
          const requested = calendarDaysInYearRange(input.startAt, input.endAt, year);
          if (alreadyRequested + requested > entitlement.entitlementDays) {
            throw new HrRequestError(
              `Le solde annuel ${year} est insuffisant : ${alreadyRequested} jour(s) réservé(s), ${requested} demandé(s), ${entitlement.entitlementDays} autorisé(s).`,
              409,
            );
          }
        }
      }
      return transaction.hrLeaveRequest.create({
        data: {
          ...input,
          entityId,
          requestedByUserId,
          status: 'PENDING',
        },
        include: leaveRequestInclude,
      });
    });
  }

  static async review(
    id: string,
    entityId: string,
    reviewedByUserId: string,
    decision: unknown,
    note: unknown,
  ) {
    const review = validateHrLeaveDecision(decision, note);
    const request = await prisma.hrLeaveRequest.findFirst({
      where: { id, entityId },
      select: { id: true, status: true, requestedByUserId: true },
    });
    if (!request) throw new HrRequestError('Demande de congé introuvable pour cette société.', 404);
    if (request.status !== 'PENDING') {
      throw new HrRequestError('Seule une demande en attente peut être revue.', 409);
    }
    if (request.requestedByUserId === reviewedByUserId) {
      throw new HrRequestError('Une autre personne doit examiner la demande de congé.', 409);
    }

    const updated = await prisma.hrLeaveRequest.updateMany({
      where: {
        id,
        entityId,
        status: 'PENDING',
        requestedByUserId: { not: reviewedByUserId },
      },
      data: {
        status: review.decision,
        reviewedByUserId,
        reviewNote: review.note,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new HrRequestError('La demande a changé ou a déjà été revue.', 409);
    }
    return prisma.hrLeaveRequest.findFirst({
      where: { id, entityId },
      include: leaveRequestInclude,
    });
  }
}

export default HrLeaveRequestService;
