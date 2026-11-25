import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import { hashPassword } from '../application/security/passwords';

let prisma: PrismaClientType | undefined;
const databaseUrl = 'file:../mega-demo-synthetic.db';
const confirmation = 'YES';
const marker = 'SAFE-SYNTHETIC-MEGA-2026';
const entityCodes = ['SAFE-DEMO-001', 'SAFE-FR-001', 'SAFE-MA-001', 'SAFE-AE-001'];
const periods = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 10 + index, 1));
  return date.toISOString().slice(0, 7);
});

function periodDate(period: string, day = 15): Date {
  return new Date(`${period}-${String(day).padStart(2, '0')}T12:00:00.000Z`);
}

async function main(): Promise<void> {
  const guardFailures = [
    process.env.NODE_ENV === 'production' ? 'production environment' : null,
    process.env.SAFE_ERP_DATABASE_PROVIDER !== 'sqlite' ? 'database provider' : null,
    process.env.SAFE_ERP_DATABASE_URL !== databaseUrl ? 'database URL' : null,
    process.env.SAFE_ERP_MEGA_DEMO_CONFIRM !== confirmation ? 'confirmation' : null,
  ].filter((failure): failure is string => failure !== null);
  if (guardFailures.length > 0) {
    throw new Error(`Seed refusé : configuration non autorisée (${guardFailures.join(', ')}).`);
  }

  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();

  const entities = await prisma.entity.findMany({
    where: { code: { in: entityCodes } },
    include: { country: true },
    orderBy: { code: 'asc' },
  });
  if (
    entities.length !== entityCodes.length ||
    entities.some((entity) => !/synthétique|fictive/i.test(entity.name))
  ) {
    throw new Error('Le groupe synthétique complet doit être initialisé avant ce seed.');
  }

  const group = await prisma.consolidationGroup.findFirst({
    where: { name: 'SAFE Groupe synthétique' },
    select: { id: true },
  });
  if (!group) throw new Error('Le groupe de consolidation synthétique est absent.');

  const markerExists = await prisma.workbookFeatureConfiguration.findFirst({
    where: { featureKey: 'SYNTHETIC_MEGA_DATASET' },
    select: { id: true },
  });
  if (markerExists) throw new Error('Le jeu mega synthétique existe déjà; aucune donnée n’a été modifiée.');

  const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
  await prisma.$transaction(async (tx) => {
    for (const entity of entities) {
      const code = entity.code;
      const currencyCode = entity.country.currencyCode;
      const actorUsername = `SYNTHETIC-SEED-${code}`;
      const actor = await tx.user.create({
        data: {
          username: actorUsername,
          passwordHash,
          role: 'ADMIN',
          entityId: entity.id,
          isActive: false,
        },
      });

      await tx.workbookFeatureConfiguration.create({
        data: {
          entityId: entity.id,
          featureKey: 'SYNTHETIC_MEGA_DATASET',
          configurationJson: JSON.stringify({
            marker,
            syntheticOnly: true,
            warning: 'Fictif; ne pas utiliser pour des paiements, déclarations ou décisions réelles.',
          }),
          enabled: false,
          sourceReference: marker,
          confirmationNote: 'Jeu synthétique de démonstration uniquement.',
        },
      });
      await tx.workbookFeatureConfigurationRevision.create({
        data: {
          entityId: entity.id,
          featureKey: 'SYNTHETIC_MEGA_DATASET',
          version: 1,
          configurationJson: JSON.stringify({ marker, syntheticOnly: true }),
          enabled: false,
          sourceReference: marker,
          actorUserId: actor.id,
          actorUsername,
        },
      });

      await Promise.all([
        tx.costCenter.create({ data: { code: `MEGA-${code}-CC-FIN`, name: 'Finance fictive', department: 'Finance', entityId: entity.id } }),
        tx.costCenter.create({ data: { code: `MEGA-${code}-CC-HR`, name: 'RH fictives', department: 'HR', entityId: entity.id } }),
        tx.costCenter.create({ data: { code: `MEGA-${code}-CC-OPS`, name: 'Opérations fictives', department: 'Operations', entityId: entity.id } }),
      ]);

      for (const period of periods) {
        await Promise.all([
          tx.budgetLine.create({
            data: {
              entityId: entity.id,
              period,
              accountCode: 'SYN-REVENUE',
              amount: 50000 + Number(period.slice(5)) * 1000,
              status: 'DRAFT',
              createdByUserId: actor.id,
            },
          }),
          tx.budgetLine.create({
            data: {
              entityId: entity.id,
              period,
              accountCode: 'SYN-OPERATING_EXPENSE',
              amount: 28000 + Number(period.slice(5)) * 500,
              status: 'DRAFT',
              createdByUserId: actor.id,
            },
          }),
          tx.monthlyCloseChecklistEvent.create({
            data: {
              entityId: entity.id,
              period,
              checkKey: 'SYNTHETIC_REVIEW',
              checked: false,
              note: `${marker}: contrôle fictif non validé.`,
              actorUserId: actor.id,
              actorUsername,
            },
          }),
        ]);
      }

      const project = await tx.project.create({
        data: {
          entityId: entity.id,
          projectCode: `MEGA-${code}-ERP`,
          name: 'Projet fictif de déploiement industriel',
          description: `${marker}: scénario de projet sans valeur contractuelle.`,
          status: 'IN_PROGRESS',
          budgetAmount: 125000,
          contractAmount: 118000,
          startAt: periodDate('2026-01', 1),
          endAt: periodDate('2026-12', 31),
          tasks: {
            create: [
              { title: 'Cadrage fictif', status: 'COMPLETED', completedAt: periodDate('2026-02', 20) },
              { title: 'Mise en Å“uvre fictive', status: 'IN_PROGRESS', dueAt: periodDate('2026-11', 30) },
            ],
          },
          milestones: {
            create: [
              { title: 'Lot pilote fictif', dueAt: periodDate('2026-09', 30), completedAt: periodDate('2026-09', 28) },
            ],
          },
        },
      });
      await tx.projectCost.create({
        data: {
          entityId: entity.id,
          projectId: project.id,
          category: 'SYNTHETIC',
          description: `${marker}: coût de scénario`,
          amount: 7250,
          occurredAt: periodDate('2026-10', 20),
          sourceReference: marker,
          createdByUserId: actor.id,
        },
      });

      const employees = await Promise.all([
        tx.employee.create({
          data: {
            empId: `MEGA-${code}-EMP-001`,
            firstName: 'Amina',
            lastName: `Démo-${code}`,
            email: `amina.${code.toLowerCase()}@example.invalid`,
            position: 'Responsable financière fictive',
            baseSalary: 2500,
            maritalStatus: 'MARRIED',
            isHeadOfFamily: true,
            childrenCount: 1,
            hiredAt: periodDate('2024-01', 2),
            entityId: entity.id,
          },
        }),
        tx.employee.create({
          data: {
            empId: `MEGA-${code}-EMP-002`,
            firstName: 'Sami',
            lastName: `Échantillon-${code}`,
            email: `sami.${code.toLowerCase()}@example.invalid`,
            position: 'Technicien fictif',
            baseSalary: 1800,
            hiredAt: periodDate('2024-04', 1),
            entityId: entity.id,
          },
        }),
      ]);

      for (const [index, employee] of employees.entries()) {
        const grossSalary = employee.baseSalary;
        const employeeCnss = Math.round(grossSalary * 0.05 * 1000) / 1000;
        const taxableGross = grossSalary - employeeCnss;
        const irpp = Math.round(taxableGross * 0.08 * 1000) / 1000;
        const css = Math.round(taxableGross * 0.01 * 1000) / 1000;
        await tx.payslip.create({
          data: {
            employeeId: employee.id,
            period: '2026-10',
            currencyCode,
            grossSalary,
            employeeCnss,
            employerCnss: Math.round(grossSalary * 0.12 * 1000) / 1000,
            foprolos: Math.round(grossSalary * 0.01 * 1000) / 1000,
            taxableGross,
            irpp,
            css,
            netSalary: grossSalary - employeeCnss - irpp - css,
            calculationSnapshot: JSON.stringify({
              marker,
              syntheticOnly: true,
              warning: 'Taux et montants illustratifs; aucune conformité locale ou déclaration n’est affirmée.',
            }),
          },
        });
        const entitlement = await tx.hrLeaveEntitlement.create({
          data: {
            entityId: entity.id,
            employeeId: employee.id,
            leaveType: 'ANNUAL',
            year: 2026,
            entitlementDays: 20,
            policySource: `${marker}: règle fictive`,
            effectiveFrom: periodDate('2026-01', 1),
            updatedByUserId: actor.id,
            updatedByUsername: actorUsername,
          },
        });
        await tx.hrLeaveEntitlementEvent.create({
          data: {
            entitlementId: entitlement.id,
            nextEntitlementDays: 20,
            policySource: `${marker}: règle fictive`,
            effectiveFrom: periodDate('2026-01', 1),
            reason: `${marker}: attribution illustrative`,
            actorUserId: actor.id,
            actorUsername,
          },
        });
        await tx.hrLeaveRequest.create({
          data: {
            entityId: entity.id,
            employeeId: employee.id,
            leaveType: 'ANNUAL',
            startAt: periodDate('2026-12', 14 + index),
            endAt: periodDate('2026-12', 15 + index),
            reason: `${marker}: demande fictive`,
            status: 'PENDING',
            requestedByUserId: actor.id,
          },
        });
        const document = await tx.employeeDocument.create({
          data: {
            employeeId: employee.id,
            category: 'SYNTHETIC',
            title: `${marker}: pièce fictive non fournie`,
            status: 'MISSING',
            createdByUserId: actor.id,
            createdByUsername: actorUsername,
          },
        });
        await tx.employeeDocumentEvent.create({
          data: {
            documentId: document.id,
            action: 'SYNTHETIC_METADATA_CREATED',
            actorUserId: actor.id,
            actorUsername,
            note: `${marker}: aucun document personnel réel n’est joint.`,
          },
        });
        const claim = await tx.employeeExpenseClaim.create({
          data: {
            employeeId: employee.id,
            category: 'TRAVEL',
            expenseDate: periodDate('2026-10', 10 + index),
            amount: 125 + index * 35,
            currency: currencyCode,
            status: 'TO_REVIEW',
            submittedByUserId: actor.id,
            submittedByUsername: actorUsername,
          },
        });
        await tx.employeeExpenseClaimEvent.create({
          data: {
            expenseClaimId: claim.id,
            action: 'SYNTHETIC_SUBMITTED',
            statusTo: 'TO_REVIEW',
            actorUserId: actor.id,
            actorUsername,
          },
        });
      }

      const position = await tx.recruitmentPosition.create({
        data: {
          entityId: entity.id,
          title: 'Analyste opérations — poste fictif',
          status: 'OPEN',
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
        },
      });
      const application = await tx.candidateApplication.create({
        data: {
          positionId: position.id,
          firstName: 'Candidat',
          lastName: `Fictif-${code}`,
          email: `candidat.${code.toLowerCase()}@example.invalid`,
          status: 'INTERVIEW',
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
          events: {
            create: [{
              action: 'SYNTHETIC_REVIEW',
              statusFrom: 'RECEIVED',
              statusTo: 'INTERVIEW',
              actorUserId: actor.id,
              actorUsername,
            }],
          },
        },
      });
      await tx.candidateInterview.create({
        data: {
          applicationId: application.id,
          scheduledAt: periodDate('2026-12', 10),
          status: 'SCHEDULED',
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
          events: {
            create: [{
              action: 'SYNTHETIC_SCHEDULED',
              statusTo: 'SCHEDULED',
              actorUserId: actor.id,
              actorUsername,
            }],
          },
        },
      });

      const warehouseA = await tx.warehouse.create({
        data: { entityId: entity.id, code: `MEGA-${code}-WH-A`, name: 'Dépôt fictif principal' },
      });
      const warehouseB = await tx.warehouse.create({
        data: { entityId: entity.id, code: `MEGA-${code}-WH-B`, name: 'Dépôt fictif secondaire' },
      });
      const materials = await Promise.all([
        tx.material.create({
          data: {
            entityId: entity.id,
            sku: `MEGA-${code}-RAW-001`,
            name: `${marker}: matière première fictive`,
            unitCode: 'EA',
            quantity: 100,
            minimumStock: 10,
            unitPrice: 125,
            costPrice: 80,
          },
        }),
        tx.material.create({
          data: {
            entityId: entity.id,
            sku: `MEGA-${code}-FIN-001`,
            name: `${marker}: produit fini fictif`,
            unitCode: 'EA',
            quantity: 25,
            minimumStock: 5,
            unitPrice: 300,
            costPrice: 190,
          },
        }),
      ]);
      await Promise.all([
        tx.materialWarehouseStock.create({
          data: { entityId: entity.id, materialId: materials[0].id, warehouseId: warehouseA.id, quantity: 100 },
        }),
        tx.materialWarehouseStock.create({
          data: { entityId: entity.id, materialId: materials[0].id, warehouseId: warehouseB.id, quantity: 0 },
        }),
        tx.materialWarehouseStock.create({
          data: { entityId: entity.id, materialId: materials[1].id, warehouseId: warehouseA.id, quantity: 25 },
        }),
      ]);
      const productionOrder = await tx.productionOrder.create({
        data: {
          entityId: entity.id,
          orderNumber: `MEGA-${code}-PROD-001`,
          description: `${marker}: ordre de fabrication fictif en brouillon`,
          outputMaterialId: materials[1].id,
          outputQuantity: 10,
          laborCost: 250,
          overheadCost: 90,
          status: 'DRAFT',
          warehouseId: warehouseA.id,
          consumptions: {
            create: [{
              materialId: materials[0].id,
              quantity: 12,
              warehouseId: warehouseA.id,
            }],
          },
        },
      });
      void productionOrder;

      const purchaseInvoice = await tx.purchaseInvoice.findFirst({
        where: { entityId: entity.id },
        orderBy: { issueDate: 'asc' },
      });
      const vendor = await tx.vendor.findFirst({ where: { entityId: entity.id } });
      const customer = await tx.customer.findFirst({ where: { entityId: entity.id } });
      const bankAccount = await tx.bankAccount.findFirst({ where: { entityId: entity.id } });
      if (!purchaseInvoice || !vendor || !customer || !bankAccount) {
        throw new Error(`Données de base manquantes pour ${code}; transaction annulée.`);
      }

      await tx.purchaseOrder.create({
        data: {
          entityId: entity.id,
          orderNumber: `MEGA-${code}-PO-001`,
          vendorId: vendor.id,
          currencyCode,
          expectedAt: periodDate('2026-12', 18),
          status: 'TO_REVIEW',
          description: `${marker}: commande fictive à examiner`,
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
          lines: {
            create: [{
              description: `${marker}: article fictif`,
              materialId: materials[0].id,
              quantity: 12,
              unitPrice: 80,
            }],
          },
        },
      });
      await tx.salesQuote.create({
        data: {
          entityId: entity.id,
          quoteNumber: `MEGA-${code}-QUOTE-001`,
          customerId: customer.id,
          currencyCode,
          subTotal: 600,
          taxAmount: 0,
          totalAmount: 600,
          status: 'DRAFT',
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
          items: {
            create: [{
              position: 1,
              description: `${marker}: offre fictive`,
              quantity: 2,
              unitPrice: 300,
              taxRate: 0,
              totalAmount: 600,
            }],
          },
        },
      });
      await tx.salesOrder.create({
        data: {
          entityId: entity.id,
          orderNumber: `MEGA-${code}-SO-001`,
          customerId: customer.id,
          currencyCode,
          totalAmount: 600,
          status: 'OPEN',
          createdByUserId: actor.id,
          createdByUsername: actorUsername,
          lines: {
            create: [{
              materialId: materials[1].id,
              description: `${marker}: commande fictive`,
              quantity: 2,
              unitPrice: 300,
              totalAmount: 600,
            }],
          },
        },
      });

      const statementHash = createHash('sha256').update(`${marker}:${code}`).digest('hex');
      const statement = await tx.bankStatement.create({
        data: {
          entityId: entity.id,
          bankAccountId: bankAccount.id,
          sourceHash: statementHash,
          originalFilename: `${marker}-${code}.csv`,
          lineCount: 2,
          importedByUserId: actor.id,
        },
      });
      await Promise.all([
        tx.bankStatementLine.create({
          data: {
            entityId: entity.id,
            bankAccountId: bankAccount.id,
            statementId: statement.id,
            rowNumber: 1,
            transactionDate: periodDate('2026-10', 10),
            description: `${marker}: encaissement fictif`,
            amount: 100,
            balanceAfter: 5100,
            currencyCode,
            externalReference: `MEGA-${code}-BANK-IN`,
            deduplicationKey: `${marker}:${code}:IN`,
          },
        }),
        tx.bankStatementLine.create({
          data: {
            entityId: entity.id,
            bankAccountId: bankAccount.id,
            statementId: statement.id,
            rowNumber: 2,
            transactionDate: periodDate('2026-10', 11),
            description: `${marker}: décaissement fictif`,
            amount: -80,
            balanceAfter: 5020,
            currencyCode,
            externalReference: `MEGA-${code}-BANK-OUT`,
            deduplicationKey: `${marker}:${code}:OUT`,
          },
        }),
      ]);
      await tx.cashflowAccountingMapping.upsert({
        where: { entityId: entity.id },
        update: { receivableAccountCode: 'SYN-TRADE_RECEIVABLE', payableAccountCode: 'SYN-TRADE_PAYABLE' },
        create: {
          entityId: entity.id,
          receivableAccountCode: 'SYN-TRADE_RECEIVABLE',
          payableAccountCode: 'SYN-TRADE_PAYABLE',
        },
      });
      const scenario = await tx.cashForecastScenario.create({
        data: {
          entityId: entity.id,
          bankAccountId: bankAccount.id,
          name: `${marker} — trésorerie fictive`,
          currencyCode,
          openingBalance: 5020,
          openingBalanceDate: periodDate('2026-10', 11),
          openingBalanceSource: marker,
          items: {
            create: periods.slice(0, 6).map((period, index) => ({
              entityId: entity.id,
              expectedDate: periodDate(period, 20),
              description: `${marker}: prévision ${index + 1}`,
              direction: index % 2 === 0 ? 'IN' : 'OUT',
              amount: 1000 + index * 100,
              category: 'SYNTHETIC',
              sourceType: 'SYNTHETIC',
              sourceId: `${marker}:${code}:${period}`,
            })),
          },
        },
      });
      void scenario;

      const equipment = await tx.equipment.create({
        data: {
          entityId: entity.id,
          assetTag: `MEGA-${code}-VEH-001`,
          name: `${marker}: véhicule fictif`,
          category: 'VEHICLE',
          location: 'Site fictif',
          isVehicle: true,
          vehicleRegistrationNumber: `SYN-${code}`,
          vehicleOdometerKm: 12500,
          vehicleFuelType: 'HYBRID-SYNTHETIC',
          vehicleInsuranceExpiry: periodDate('2027-06', 30),
          vehicleNextServiceAt: periodDate('2026-12', 15),
          vehicleNextServiceOdometerKm: 15000,
        },
      });
      await tx.equipmentVehicleAssignment.create({
        data: { entityId: entity.id, equipmentId: equipment.id, employeeId: employees[0].id },
      });
      await tx.maintenanceWorkOrder.create({
        data: {
          entityId: entity.id,
          equipmentId: equipment.id,
          type: 'PREVENTIVE',
          description: `${marker}: entretien fictif planifié`,
          scheduledAt: periodDate('2026-12', 15),
          status: 'PLANNED',
        },
      });
      const finding = await tx.qualityFinding.create({
        data: {
          entityId: entity.id,
          equipmentId: equipment.id,
          title: `${marker}: constat fictif`,
          description: 'Exemple de non-conformité simulée, sans produit ni personne réelle.',
          source: 'SYNTHETIC',
          severity: 'LOW',
          status: 'OPEN',
          detectedAt: periodDate('2026-10', 5),
          dueAt: periodDate('2026-12', 1),
          owner: actorUsername,
        },
      });
      await tx.qualityAction.create({
        data: {
          findingId: finding.id,
          type: 'CORRECTIVE',
          description: `${marker}: action fictive à vérifier`,
          owner: actorUsername,
          dueAt: periodDate('2026-12', 1),
          status: 'OPEN',
        },
      });

      const tender = await tx.tenderBid.create({
        data: {
          entityId: entity.id,
          tenderReference: `MEGA-${code}-TENDER-001`,
          title: `${marker}: appel d’offres fictif`,
          contractingAuthority: 'Autorité fictive',
          submissionDeadline: periodDate('2026-12', 20),
          status: 'TRACKING',
          documents: {
            create: [
              { title: 'Pièce administrative fictive', isRequired: true, status: 'MISSING' },
              { title: 'Offre technique fictive', isRequired: true, status: 'MISSING' },
            ],
          },
          cautions: {
            create: [{
              kind: 'BID',
              amount: 0,
              currencyCode,
              status: 'PLANNED',
              reference: `${marker}: aucune caution réelle`,
            }],
          },
        },
      });
      void tender;

      const jurisdiction = await tx.taxJurisdiction.create({
        data: {
          countryId: entity.countryId,
          kind: 'SYNTHETIC',
          code: `MEGA-${code}`,
          name: `${marker}: juridiction fictive`,
          rules: {
            create: [{
              code: `MEGA-${code}-RULE`,
              name: `${marker}: règle d’essai uniquement`,
              taxType: 'SYNTHETIC',
              calculationMethod: 'FIXED_RATE',
              taxBase: 'SYNTHETIC',
              currencyCode,
              filingPeriod: 'MONTHLY-SYNTHETIC',
              effectiveFrom: periodDate('2026-01', 1),
              status: 'DRAFT',
              sourceName: marker,
              notes: 'Règle fictive de test; ne représente pas la législation du pays.',
              rates: {
                create: [{
                  sequence: 1,
                  name: 'Taux purement illustratif',
                  rateType: 'PERCENT',
                  rateValue: 5,
                  unit: 'PERCENT',
                  currencyCode,
                }],
              },
            }],
          },
        },
      });
      void jurisdiction;
      await tx.countryRegulatoryRevision.create({
        data: {
          countryId: entity.countryId,
          configType: 'SYNTHETIC_DEMO',
          version: 1,
          effectiveFrom: periodDate('2026-01', 1),
          source: marker,
          status: 'DRAFT',
          snapshot: JSON.stringify({ marker, syntheticOnly: true }),
          createdBy: actorUsername,
          reviewNote: 'Aucune validation juridique ou fiscale.',
        },
      });

      const customsRegime = await tx.customsDutyRegime.create({
        data: {
          entityId: entity.id,
          regimeType: 'SYNTHETIC',
          regimeReference: `MEGA-${code}-CUSTOMS-001`,
          title: `${marker}: régime douanier fictif`,
          description: 'Dossier de démonstration sans valeur douanière.',
          startsAt: periodDate('2026-01', 1),
          status: 'DRAFT',
          stockSheets: {
            create: [{
              sheetReference: `MEGA-${code}-SHEET-001`,
              tariffCode: 'SYNTHETIC-CODE',
              itemDescription: `${marker}: marchandise fictive`,
              unitCode: 'EA',
              movements: {
                create: [{
                  direction: 'IN',
                  quantity: 10,
                  occurredAt: periodDate('2026-10', 5),
                  reference: `${marker}: mouvement fictif`,
                  note: 'Ne constitue pas un document douanier.',
                }],
              },
            }],
          },
          bonds: {
            create: [{
              bondReference: `MEGA-${code}-BOND-001`,
              amount: 0,
              currencyCode,
              status: 'DRAFT',
            }],
          },
        },
      });
      void customsRegime;
      await tx.customsTariffRate.create({
        data: {
          countryId: entity.countryId,
          tariffCode: `MEGA-${code}-TARIFF`,
          description: `${marker}: taux douanier fictif non applicable`,
          customsDutyRate: 0,
          consumptionDutyRate: 0,
          fodecRate: 0,
          importVatRate: 0,
          customsServiceFeeRate: 0,
          customsDutyBaseComponents: '[]',
          consumptionDutyBaseComponents: '[]',
          fodecBaseComponents: '[]',
          importVatBaseComponents: '[]',
          customsServiceFeeBaseComponents: '[]',
          effectiveFrom: periodDate('2026-01', 1),
          sourceName: marker,
          sourceReference: 'DRAFT-SYNTHETIC-ONLY',
          status: 'DRAFT',
          createdByUserId: actor.id,
        },
      });

      const withholdingRate = 0;
      await tx.withholdingCertificate.create({
        data: {
          entityId: entity.id,
          purchaseInvoiceId: purchaseInvoice.id,
          certificateNumber: `MEGA-${code}-WHT-001`,
          beneficiaryName: `${marker}: fournisseur fictif`,
          category: 'SYNTHETIC',
          grossAmountTtc: purchaseInvoice.totalAmount,
          withholdingRate,
          withholdingAmount: 0,
          currencyCode,
          period: '2026-10',
          sourceType: 'SYNTHETIC',
          sourceReference: marker,
          ruleSource: `${marker}: aucune règle fiscale`,
          status: 'PREPARED',
          preparedByUserId: actor.id,
          preparedByUsername: actorUsername,
        },
      });

      await tx.partnerScoreSnapshot.create({
        data: {
          entityId: entity.id,
          scoreType: 'SYNTHETIC',
          partnerId: customer.id,
          score: 75,
          alertThreshold: 40,
          alertTriggered: false,
          metricsJson: JSON.stringify({ marker, syntheticOnly: true }),
          configurationVersion: 1,
        },
      });
      await tx.partnerDispute.create({
        data: {
          entityId: entity.id,
          partnerType: 'CUSTOMER',
          partnerId: customer.id,
          reference: `MEGA-${code}-DISPUTE-001`,
          note: `${marker}: litige fictif ouvert pour démonstration.`,
          status: 'OPEN',
          createdByUserId: actor.id,
          createdBy: actorUsername,
        },
      });
      await tx.aiRequestAuditEvent.create({
        data: {
          requestId: `MEGA-${code}-AUDIT-001`,
          entityId: entity.id,
          actorUserId: actor.id,
          task: 'SYNTHETIC_DEMO',
          dataClass: 'SYNTHETIC',
          eventType: 'SIMULATED',
          route: '/synthetic-demo',
          cloudConsent: false,
          fallbackUsed: false,
        },
      });
    }
  }, { maxWait: 10000, timeout: 120000 });

  const [employees, payslips, budgets, projects, invoices, purchases, intercompany, regulations] = await Promise.all([
    prisma.employee.count({ where: { empId: { startsWith: 'MEGA-' } } }),
    prisma.payslip.count({ where: { calculationSnapshot: { contains: marker } } }),
    prisma.budgetLine.count({ where: { period: { in: periods }, createdBy: { username: { startsWith: 'SYNTHETIC-SEED-' } } } }),
    prisma.project.count({ where: { projectCode: { startsWith: 'MEGA-' } } }),
    prisma.invoice.count(),
    prisma.purchaseInvoice.count(),
    prisma.intercompanyTransaction.count(),
    prisma.countryRegulatoryRevision.count({ where: { source: marker } }),
  ]);
  console.log(JSON.stringify({
    syntheticOnly: true,
    database: 'mega-demo-synthetic.db',
    companies: entities.length,
    employees,
    illustrativePayslips: payslips,
    budgets,
    projects,
    salesInvoices: invoices,
    purchaseInvoices: purchases,
    intercompanyTransactions: intercompany,
    draftRegulatoryRevisions: regulations,
    warning: 'Aucune donnée de ce jeu ne représente une entreprise, une paie ou une déclaration réelle.',
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed mega synthétique :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
