import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { ConsolidationRequestError } from './errors';
import ConsolidationService from './service';

let ownerEntityId = '';
let foreignEntityId = '';
let otherEntityId = '';

before(async () => {
  const [tunisia, usd] = await Promise.all([
    prisma.countryProfile.create({ data: { code: 'CTN', name: 'Consolidation TN test', currencyCode: 'TND' } }),
    prisma.countryProfile.create({ data: { code: 'CUS', name: 'Consolidation USD test', currencyCode: 'USD' } }),
  ]);
  const [owner, foreign, other] = await Promise.all([
    prisma.entity.create({ data: { code: 'CONS-OWNER', name: 'Consolidation owner test', countryId: tunisia.id } }),
    prisma.entity.create({ data: { code: 'CONS-USD', name: 'Consolidation USD test', countryId: usd.id } }),
    prisma.entity.create({ data: { code: 'CONS-OTHER', name: 'Consolidation other test', countryId: tunisia.id } }),
  ]);
  ownerEntityId = owner.id;
  foreignEntityId = foreign.id;
  otherEntityId = other.id;
  await prisma.chartOfAccount.createMany({
    data: [
      { countryId: tunisia.id, code: '1001', description: 'Actif local test', classNumber: 1, type: 'Asset' },
      { countryId: tunisia.id, code: '2001', description: 'Passif local test', classNumber: 2, type: 'Liability' },
      { countryId: usd.id, code: 'A100', description: 'Actif devise test', classNumber: 1, type: 'Asset' },
      { countryId: usd.id, code: 'L200', description: 'Passif devise test', classNumber: 2, type: 'Liability' },
    ],
  });
  await Promise.all([
    prisma.journalEntry.create({
      data: {
        entryNumber: 'CONS-TN-ENTRY',
        entityId: owner.id,
        date: new Date('2026-03-15T00:00:00.000Z'),
        description: 'Écriture synthétique de test TN',
        status: 'POSTED',
        lines: { create: [
          { accountCode: '1001', debit: 100.5, credit: 0 },
          { accountCode: '2001', debit: 0, credit: 100.5 },
        ] },
      },
    }),
    prisma.journalEntry.create({
      data: {
        entryNumber: 'CONS-USD-ENTRY',
        entityId: foreign.id,
        date: new Date('2026-03-16T00:00:00.000Z'),
        description: 'Écriture synthétique de test USD',
        status: 'POSTED',
        lines: { create: [
          { accountCode: 'A100', debit: 50, credit: 0 },
          { accountCode: 'L200', debit: 0, credit: 50 },
        ] },
      },
    }),
  ]);
});

after(async () => {
  await prisma.$disconnect();
});

describe('persisted group consolidation', () => {
  it('blocks incomplete setup and aggregates mapped balances with explicit FX and approved adjustments', async () => {
    const group = await ConsolidationService.createGroup({
      name: 'Groupe de test synthétique',
      reportingCurrencyCode: 'TND',
    }, ownerEntityId);
    await ConsolidationService.addEntity({
      entityId: foreignEntityId,
      ownershipPercentage: 75,
      consolidationMethod: 'FULL',
    }, group.id, ownerEntityId);

    const initialRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(initialRun.status, 'BLOCKED');
    assert.ok(initialRun.diagnostics.some((message) => message.includes('politique d’élimination')));
    assert.ok(initialRun.diagnostics.some((message) => message.includes('Mapping manquant')));
    assert.ok(initialRun.diagnostics.some((message) => message.includes('Taux de conversion manquant')));
    const reloadedGroup = await ConsolidationService.getGroup(group.id, ownerEntityId);
    const reloadedInitialRun = reloadedGroup.runs.find((run) => run.id === initialRun.id);
    assert.ok(Array.isArray(reloadedInitialRun?.diagnostics));
    assert.ok(reloadedInitialRun?.diagnostics.some((message) => message.includes('Mapping manquant')));
    const listedGroup = (await ConsolidationService.listGroups(ownerEntityId)).find((item) => item.id === group.id);
    const listedInitialRun = listedGroup?.runs.find((run) => run.id === initialRun.id);
    assert.ok(Array.isArray(listedInitialRun?.diagnostics));
    assert.ok(listedInitialRun?.diagnostics.some((message) => message.includes('Taux de conversion manquant')));
    await assert.rejects(
      ConsolidationService.addEntity({
        entityId: otherEntityId,
        ownershipPercentage: 10.0001,
        consolidationMethod: 'PROPORTIONAL',
      }, group.id, ownerEntityId),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 400,
    );
    await assert.rejects(
      ConsolidationService.addEntity({
        entityId: otherEntityId,
        ownershipPercentage: 50,
        consolidationMethod: 'EQUITY',
      }, group.id, ownerEntityId),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 422,
    );
    await assert.rejects(
      ConsolidationService.getRun(initialRun.id, otherEntityId),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 404,
    );

    await ConsolidationService.setAccountMappings({ mappings: [
      { localAccountCode: '1001', groupAccountCode: '1000', groupAccountDescription: 'Actifs consolidés' },
      { localAccountCode: '2001', groupAccountCode: '2000', groupAccountDescription: 'Passifs consolidés' },
    ] }, group.id, ownerEntityId, ownerEntityId);
    await ConsolidationService.setAccountMappings({ mappings: [
      { localAccountCode: 'A100', groupAccountCode: '1000', groupAccountDescription: 'Actifs consolidés' },
      { localAccountCode: 'L200', groupAccountCode: '2000', groupAccountDescription: 'Passifs consolidés' },
    ] }, group.id, foreignEntityId, ownerEntityId);
    await ConsolidationService.setEliminationPolicy({ policy: 'MANUAL_ADJUSTMENTS' }, group.id, ownerEntityId);

    const missingRate = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(missingRate.status, 'BLOCKED');
    assert.ok(missingRate.diagnostics.some((message) => message.includes('Taux de conversion manquant')));
    await ConsolidationService.setFxRate({
      period: '2026-03',
      rate: 1.4,
      rateDate: '2026-03-31',
      source: 'Fixture synthétique de test uniquement',
    }, group.id, foreignEntityId, ownerEntityId);
    const missingAdjustment = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(missingAdjustment.status, 'BLOCKED');
    assert.ok(missingAdjustment.diagnostics.some((message) => message.includes('ajustements d’élimination')));

    const adjustment = await ConsolidationService.createAdjustment({
      period: '2026-03',
      description: 'Élimination manuelle synthétique',
      debitAccountCode: '2000',
      creditAccountCode: '1000',
      amount: 10,
    }, group.id, ownerEntityId, 'test-user');
    assert.equal(adjustment.status, 'DRAFT');
    await assert.rejects(
      ConsolidationService.approveAdjustment(adjustment.id, ownerEntityId, 'test-user'),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 403,
    );
    const unapprovedAdjustment = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(unapprovedAdjustment.status, 'BLOCKED');
    assert.ok(unapprovedAdjustment.diagnostics.some((message) => message.includes('restent à approuver')));
    await ConsolidationService.approveAdjustment(adjustment.id, ownerEntityId, 'test-approver');

    await assert.rejects(
      ConsolidationService.setFxRate({
        period: '2026-03',
        rate: 1.4,
        rateDate: '2026-04-01',
        source: 'Date hors période synthétique de test',
      }, group.id, foreignEntityId, ownerEntityId),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 400,
    );
    await prisma.consolidationFxRate.updateMany({
      where: { membership: { groupId: group.id, entityId: foreignEntityId }, period: '2026-03' },
      data: { rateDate: new Date('2026-04-01T00:00:00.000Z') },
    });
    const outOfPeriodRateRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(outOfPeriodRateRun.status, 'BLOCKED');
    assert.ok(outOfPeriodRateRun.diagnostics.some((message) => message.includes('n’appartient pas à la période 2026-03')));
    await prisma.consolidationFxRate.updateMany({
      where: { membership: { groupId: group.id, entityId: foreignEntityId }, period: '2026-03' },
      data: { rateDate: new Date('2026-03-31T00:00:00.000Z') },
    });

    const readyRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(readyRun.status, 'READY');
    assert.deepEqual(readyRun.diagnostics, []);
    assert.equal(readyRun.lines.find((line) => line.groupAccountCode === '1000' && line.lineType === 'AGGREGATE')?.debit, 170.5);
    assert.equal(readyRun.lines.find((line) => line.groupAccountCode === '2000' && line.lineType === 'AGGREGATE')?.credit, 170.5);
    assert.equal(readyRun.lines.find((line) => line.groupAccountCode === '2000' && line.lineType === 'ELIMINATION')?.debit, 10);
    assert.equal(readyRun.lines.find((line) => line.groupAccountCode === '1000' && line.lineType === 'ELIMINATION')?.credit, 10);
    assert.equal((await ConsolidationService.getRun(readyRun.id, ownerEntityId)).status, 'READY');

    const [unbalancedOwnerEntry, unbalancedForeignEntry] = await Promise.all([
      prisma.journalEntry.create({
        data: {
          entryNumber: 'CONS-OWNER-UNBALANCED',
          entityId: ownerEntityId,
          date: new Date('2026-03-20T00:00:00.000Z'),
          description: 'Écriture non équilibrée synthétique de test TN',
          status: 'POSTED',
          lines: { create: [{ accountCode: '1001', debit: 7, credit: 0 }] },
        },
      }),
      prisma.journalEntry.create({
        data: {
          entryNumber: 'CONS-USD-UNBALANCED',
          entityId: foreignEntityId,
          date: new Date('2026-03-20T00:00:00.000Z'),
          description: 'Écriture non équilibrée synthétique de test USD',
          status: 'POSTED',
          lines: { create: [{ accountCode: 'A100', debit: 0, credit: 5 }] },
        },
      }),
    ]);
    const individuallyUnbalancedRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(individuallyUnbalancedRun.status, 'BLOCKED');
    assert.ok(individuallyUnbalancedRun.diagnostics.some((message) => message.includes('CONS-OWNER-UNBALANCED')));
    assert.ok(individuallyUnbalancedRun.diagnostics.some((message) => message.includes('CONS-USD-UNBALANCED')));
    await prisma.journalEntry.updateMany({
      where: { id: { in: [unbalancedOwnerEntry.id, unbalancedForeignEntry.id] } },
      data: { status: 'DRAFT' },
    });

    const emptyEntry = await prisma.journalEntry.create({
      data: {
        entryNumber: 'CONS-OWNER-EMPTY',
        entityId: ownerEntityId,
        date: new Date('2026-03-21T00:00:00.000Z'),
        description: 'Écriture vide synthétique de test TN',
        status: 'POSTED',
      },
    });
    const emptyEntryRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
    assert.equal(emptyEntryRun.status, 'BLOCKED');
    assert.ok(emptyEntryRun.diagnostics.some((message) => message.includes('CONS-OWNER-EMPTY') && message.includes('aucune ligne')));
    await prisma.journalEntry.update({
      where: { id: emptyEntry.id },
      data: { status: 'DRAFT' },
    });

    await assert.rejects(
      ConsolidationService.setEliminationPolicy({
        policy: 'NO_ELIMINATIONS_CONFIRMED',
      }, group.id, ownerEntityId, 'period-confirming-user'),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 400,
    );
    await ConsolidationService.setEliminationPolicy({
      policy: 'NO_ELIMINATIONS_CONFIRMED',
      period: '2026-03',
    }, group.id, ownerEntityId, 'period-confirming-user');
    const confirmedGroup = await ConsolidationService.getGroup(group.id, ownerEntityId);
    assert.ok(confirmedGroup.eliminationConfirmations.some((item) => item.period === '2026-03'));
    assert.equal((await ConsolidationService.run(group.id, ownerEntityId, '2026-03')).status, 'READY');
    await ConsolidationService.setFxRate({
      period: '2026-04',
      rate: 1.4,
      rateDate: '2026-04-30',
      source: 'Fixture synthétique de test uniquement',
    }, group.id, foreignEntityId, ownerEntityId);
    const unconfirmedPeriod = await ConsolidationService.run(group.id, ownerEntityId, '2026-04');
    assert.equal(unconfirmedPeriod.status, 'BLOCKED');
    assert.ok(unconfirmedPeriod.diagnostics.some((message) => message.includes('absence d’éliminations n’est pas confirmée pour 2026-04')));
    await ConsolidationService.setEliminationPolicy({
      policy: 'NO_ELIMINATIONS_CONFIRMED',
      period: '2026-04',
    }, group.id, ownerEntityId, 'period-confirming-user');
    assert.equal((await ConsolidationService.run(group.id, ownerEntityId, '2026-04')).status, 'READY');

    await prisma.consolidationGroupEntity.update({
      where: { groupId_entityId: { groupId: group.id, entityId: foreignEntityId } },
      data: { consolidationMethod: 'PROPORTIONAL' },
    });
    await prisma.journalEntry.create({
      data: {
        entryNumber: 'CONS-USD-PROPORTIONAL-ROUNDING',
        entityId: foreignEntityId,
        date: new Date('2026-03-22T00:00:00.000Z'),
        description: 'Frontière d’arrondi proportionnel synthétique',
        status: 'POSTED',
        lines: { create: [
          { accountCode: 'A100', debit: 0.002, credit: 0 },
          { accountCode: 'L200', debit: 0, credit: 0.002 },
        ] },
      },
    });
    for (const boundaryCase of [
      { ownershipPercentage: 24.999, expectedAggregate: 118 },
      { ownershipPercentage: 25, expectedAggregate: 118.001 },
      { ownershipPercentage: 25.001, expectedAggregate: 118.002 },
      { ownershipPercentage: 100, expectedAggregate: 170.503 },
    ]) {
      await prisma.consolidationGroupEntity.update({
        where: { groupId_entityId: { groupId: group.id, entityId: foreignEntityId } },
        data: { ownershipPercentage: boundaryCase.ownershipPercentage },
      });
      const proportionalRun = await ConsolidationService.run(group.id, ownerEntityId, '2026-03');
      assert.equal(proportionalRun.status, 'READY');
      assert.equal(
        proportionalRun.lines.find((line) => line.groupAccountCode === '1000' && line.lineType === 'AGGREGATE')?.debit,
        boundaryCase.expectedAggregate,
        `${boundaryCase.ownershipPercentage}% participation should produce the expected debit total`,
      );
      assert.equal(
        proportionalRun.lines.find((line) => line.groupAccountCode === '2000' && line.lineType === 'AGGREGATE')?.credit,
        boundaryCase.expectedAggregate,
        `${boundaryCase.ownershipPercentage}% participation should produce the expected credit total`,
      );
      assert.equal(proportionalRun.lines.filter((line) => line.lineType === 'ELIMINATION').length, 0);
    }

    await ConsolidationService.setEliminationPolicy({ policy: 'MANUAL_ADJUSTMENTS' }, group.id, ownerEntityId);
    const concurrentAdjustment = await ConsolidationService.createAdjustment({
      period: '2026-05',
      description: 'Synthetic concurrent approval',
      debitAccountCode: '2000',
      creditAccountCode: '1000',
      amount: 1,
    }, group.id, ownerEntityId, 'test-preparer');
    const concurrentApprovals = await Promise.allSettled([
      ConsolidationService.approveAdjustment(concurrentAdjustment.id, ownerEntityId, 'test-reviewer-a'),
      ConsolidationService.approveAdjustment(concurrentAdjustment.id, ownerEntityId, 'test-reviewer-b'),
    ]);
    assert.equal(concurrentApprovals.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejectedApproval = concurrentApprovals.find(({ status }) => status === 'rejected');
    assert.ok(rejectedApproval?.status === 'rejected');
    assert.ok(rejectedApproval.reason instanceof ConsolidationRequestError);
    assert.equal(rejectedApproval.reason.statusCode, 409);
    const approvedRaceAdjustment = await prisma.consolidationAdjustment.findUnique({
      where: { id: concurrentAdjustment.id },
      select: { status: true, approvedByUserId: true },
    });
    assert.equal(approvedRaceAdjustment?.status, 'APPROVED');
    assert.ok(['test-reviewer-a', 'test-reviewer-b'].includes(approvedRaceAdjustment?.approvedByUserId ?? ''));

    const legacyAdjustment = await prisma.consolidationAdjustment.create({
      data: {
        groupId: group.id,
        period: '2026-05',
        description: 'Synthetic legacy adjustment without creator',
        debitAccountCode: '2000',
        creditAccountCode: '1000',
        amount: 1,
        createdByUserId: null,
      },
    });
    await assert.rejects(
      ConsolidationService.approveAdjustment(legacyAdjustment.id, ownerEntityId, 'test-reviewer-c'),
      (error: unknown) => error instanceof ConsolidationRequestError && error.statusCode === 403,
    );
  });
});
