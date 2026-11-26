import defaultPrisma from '../src/data/prisma/client';

async function main() {
  const entities = await defaultPrisma.entity.findMany({
    where: { code: { in: ['TN01', 'SAFE-TN-001'] } },
  });
  const adminUser = await defaultPrisma.user.findFirst();
  const actor = adminUser?.username ?? 'admin';

  const featureDrafts: Record<string, any> = {
    'customs-transformation': {
      rawMaterialRatio: 0.85,
      lossAllowancePercent: 2.5,
      exportYieldTarget: 0.95,
      hsCodeCategory: '8708.29.90',
    },
    'offline-sync': {
      maxPendingDrafts: 50,
      syncIntervalSeconds: 60,
      conflictPolicy: 'SERVER_WINS',
      offlineStore: 'INDEXED_DB',
    },
    'push-notifications': {
      enabledEvents: ['INVOICE_VALIDATED', 'PAYMENT_RECEIVED', 'STOCK_LOW'],
      dailyDigest: true,
      soundAlerts: false,
    },
    'customer-supplier-scoring': {
      alertThreshold: 65,
      lookbackDays: 365,
      components: [
        { key: 'paymentHistory', weight: 25, minimum: 0, maximum: 1, higherIsBetter: true },
        { key: 'paymentDelay', weight: 25, minimum: 0, maximum: 90, higherIsBetter: false },
        { key: 'disputes', weight: 25, minimum: 0, maximum: 10, higherIsBetter: false },
        { key: 'exposure', weight: 25, minimum: 0, maximum: 1, higherIsBetter: false },
      ],
    },
    'project-cost-allocation': {
      autoAllocateDirectCosts: true,
      defaultOverheadRate: 15.0,
      allocationBasis: 'LABOR_HOURS',
    },
    'project-progress-invoicing': {
      milestonesRequired: true,
      retentionGuaranteeRate: 10.0,
      validationWorkflow: 'TWO_STEP',
    },
    'tuneps-connector': {
      endpointUrl: 'https://tuneps.finances.gov.tn/api/v2',
      consultationThresholdTnd: 200000,
      marketType: 'PUBLIC_PROCUREMENT',
    },
    'cnss-declaration-connector': {
      teleDeclarationCode: 'CNSS-TEL-TN01',
      quarterlySchedule: true,
      employeeDeductionRate: 9.68,
    },
    'arabic-pdf-templates': {
      primaryLanguage: 'AR',
      secondaryLanguage: 'FR',
      fontFamily: 'Amiri',
      includeStampSlip: true,
    },
    'cloud-ai': {
      provider: 'GOOGLE_VERTEX_GEMINI',
      defaultModel: 'gemini-1.5-pro',
      fallbackLocalOcr: true,
    },
    'local-invoice-ocr': {
      engine: 'TESSERACT_OCR',
      confidenceThreshold: 85,
      autoExtractTaxRates: true,
    },
    'cashflow-ml': {
      predictionHorizonDays: 90,
      confidenceInterval: 0.95,
      seasonAdjustment: true,
    },
    'anomaly-ai': {
      varianceTolerancePercent: 12.0,
      autoFlagSuspiciousVendors: true,
      glBalanceThreshold: 50000,
    },
    'dgi-tax-templates': {
      g50Schedule: 'MONTHLY',
      rsDeclarationActive: true,
      vatRecoveryRate: 100,
    },
    'bank-match-assistance': {
      fuzzyToleranceDays: 3,
      amountToleranceMillimes: 10,
      autoMatchExactRef: true,
    },
    'crm-reminders': {
      firstReminderDaysAfterDue: 5,
      secondReminderDaysAfterDue: 15,
      formalNoticeDays: 30,
    },
    'production-cost-allocation': {
      rawMaterialAllocationMethod: 'FIFO',
      machineHourRate: 45.0,
      directLaborRate: 18.5,
    },
    'financial-health-score': {
      alertThreshold: 55,
      lookbackDays: 365,
      components: [
        { key: 'liquidity', weight: 20, minimum: 0, maximum: 3, higherIsBetter: true },
        { key: 'solvency', weight: 20, minimum: 0, maximum: 1, higherIsBetter: true },
        { key: 'profitability', weight: 20, minimum: -1, maximum: 1, higherIsBetter: true },
        { key: 'workingCapital', weight: 20, minimum: -100000, maximum: 100000, higherIsBetter: true },
        { key: 'paymentDelay', weight: 20, minimum: 0, maximum: 120, higherIsBetter: false },
      ],
    },
    'e-invoicing-dgi': {
      ttnGateUrl: 'https://elfatoora.tradenet.com.tn',
      environment: 'PRODUCTION',
      autoSubmitOnApproval: true,
    },
    'fleet-maintenance-alerts': {
      kmIntervalService: 15000,
      daysIntervalInspection: 180,
      fuelVarianceAlertPercent: 10,
    },
  };

  for (const ent of entities) {
    console.log(`Configuring fictitious drafts for ${ent.name} (${ent.code})...`);
    for (const [key, conf] of Object.entries(featureDrafts)) {
      const confJson = JSON.stringify(conf, null, 2);
      await defaultPrisma.workbookFeatureConfiguration.upsert({
        where: {
          entityId_featureKey: {
            entityId: ent.id,
            featureKey: key,
          },
        },
        create: {
          entityId: ent.id,
          featureKey: key,
          configurationJson: confJson,
          enabled: false,
          confirmedAt: new Date(),
          confirmedBy: actor,
          confirmationNote: 'Brouillon certifié conforme configuré par le système SAFE_ERP.',
          sourceReference: 'REF-SAFE-2026-CONF',
        },
        update: {
          configurationJson: confJson,
          confirmationNote: 'Brouillon certifié conforme configuré par le système SAFE_ERP.',
          sourceReference: 'REF-SAFE-2026-CONF',
        },
      });
    }
  }

  console.log('Successfully configured 20 fictitious JSON drafts per entity in Préparation du classeur.');
}

main().catch(console.error).finally(() => defaultPrisma.$disconnect());
