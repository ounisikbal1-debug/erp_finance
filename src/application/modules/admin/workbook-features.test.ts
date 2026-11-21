import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getWorkbookFeatureDefinition,
  validateWorkbookFeatureConfigurationInput,
  validateWorkbookFeatureConfigurationDraft,
  WorkbookFeatureConfigurationError,
  WORKBOOK_FEATURES,
} from './workbook-features';

describe('workbook feature configuration', () => {
  it('exposes every workbook feature as configuration-only by default', () => {
    assert.ok(WORKBOOK_FEATURES.length >= 19);
    assert.equal(getWorkbookFeatureDefinition('cloud-ai')?.key, 'cloud-ai');
    assert.equal(getWorkbookFeatureDefinition('unknown-feature'), undefined);
  });

  it('accepts a bounded draft and keeps it disabled', () => {
    const result = validateWorkbookFeatureConfigurationInput('customer-supplier-scoring', {
      configuration: { weights: { payments: 1 }, threshold: 0 },
      enabled: false,
    });
    assert.equal(result.confirmConfiguration, false);
    assert.equal(result.configurationJson, '{"weights":{"payments":1},"threshold":0}');
  });

  it('rejects non-object or oversized configuration payloads', () => {
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('offline-sync', { configuration: [] }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('offline-sync', { configuration: { value: 'x'.repeat(24_001) } }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });

  it('does not persist credentials or provider secrets in functional configuration', () => {
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('tuneps-connector', {
        configuration: { endpoint: 'https://example.invalid', auth: { apiKey: 'not-stored' } },
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });

  it('requires an audit note for configuration review and never permits runtime activation', () => {
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('tuneps-connector', {
        configuration: {},
        confirmConfiguration: true,
        confirmationNote: 'verified',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('cloud-ai', {
        configuration: { consent: true },
        enabled: true,
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('only enables scoring after a complete reviewed configuration', () => {
    const config = {
      alertThreshold: 65,
      lookbackDays: 365,
      components: [
        { key: 'paymentHistory', weight: 25, minimum: 0, maximum: 1, higherIsBetter: true },
        { key: 'paymentDelay', weight: 25, minimum: 0, maximum: 90, higherIsBetter: false },
        { key: 'disputes', weight: 25, minimum: 0, maximum: 10, higherIsBetter: false },
        { key: 'exposure', weight: 25, minimum: 0, maximum: 1, higherIsBetter: false },
      ],
    };
    const result = validateWorkbookFeatureConfigurationInput('customer-supplier-scoring', {
      configuration: config,
      enabled: true,
      confirmConfiguration: true,
      confirmationNote: 'Mesures et paramètres contrôlés par le responsable.',
    });
    assert.equal(result.enable, true);
    assert.equal(result.confirmConfiguration, true);
  });

  it('allows reviewed financial health scoring only with all five configured indicators', () => {
    const configuration = {
      alertThreshold: 55,
      lookbackDays: 365,
      components: [
        { key: 'liquidity', weight: 20, minimum: 0, maximum: 3, higherIsBetter: true },
        { key: 'solvency', weight: 20, minimum: 0, maximum: 1, higherIsBetter: true },
        { key: 'profitability', weight: 20, minimum: -1, maximum: 1, higherIsBetter: true },
        { key: 'workingCapital', weight: 20, minimum: -100000, maximum: 100000, higherIsBetter: true },
        { key: 'paymentDelay', weight: 20, minimum: 0, maximum: 120, higherIsBetter: false },
      ],
    };
    const result = validateWorkbookFeatureConfigurationInput('financial-health-score', {
      configuration,
      enabled: true,
      confirmConfiguration: true,
      confirmationNote: 'Mesures et paramètres examinés par le responsable financier.',
    });
    assert.equal(result.enable, true);
  });

  it('accepts only a bounded, automatic, conflict-reviewed offline sync policy', () => {
    const policy = {
      supportedDocumentTypes: ['SALES_ORDER'],
      conflictPolicy: 'MANUAL_REVIEW',
      syncMode: 'AUTO_ONLINE',
      requireOnlineReauthentication: true,
      maxPendingItems: 25,
      maxDraftAgeHours: 72,
    };
    const result = validateWorkbookFeatureConfigurationInput('offline-sync', {
      configuration: policy,
      enabled: true,
      confirmConfiguration: true,
      confirmationNote: 'Politique automatique et conflit vérifiés par un administrateur.',
    });
    assert.equal(result.confirmConfiguration, true);
    assert.equal(result.enable, true);

    for (const unsafePolicy of [
      { ...policy, syncMode: 'MANUAL' },
      { ...policy, conflictPolicy: 'LAST_WRITE_WINS' },
      { ...policy, requireOnlineReauthentication: false },
      { ...policy, maxPendingItems: 0 },
      { ...policy, supportedDocumentTypes: ['SALES_ORDER', 'SALES_ORDER'] },
      { ...policy, unsupportedMapping: true },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('offline-sync', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Politique vérifiée par un administrateur.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
      );
    }
  });

  it('validates disabled TUNEPS and DGI connector contracts without storing credentials', () => {
    const connector = {
      contractVersion: '2026-draft-1',
      baseUrl: 'https://api.example.tn',
      resourcePath: '/v1/invoices',
      credentialProvider: 'SECRET_MANAGER',
      requestMapping: { invoiceNumber: 'document.number', totalAmount: 'document.total' },
      responseMapping: { remoteId: 'id', remoteStatus: 'status' },
    };
    const result = validateWorkbookFeatureConfigurationInput('e-invoicing-dgi', {
      configuration: connector,
      confirmConfiguration: true,
      confirmationNote: 'Contrat et correspondances revus par un administrateur.',
      sourceReference: 'Référence du contrat à vérifier hors environnement de production',
    });

    it('exposes a disabled CNSS adapter contract and keeps its connection status explicit', () => {
      const configuration = {
        contractVersion: 'official-contract-to-be-supplied',
        baseUrl: 'https://cnss.example.test',
        resourcePath: '/declaration',
        credentialProvider: 'APPLICATION_VAULT',
        requestMapping: { employerCode: 'declaration.employer' },
        responseMapping: { status: 'declaration.status' },
      };
      const result = validateWorkbookFeatureConfigurationDraft('cnss-declaration-connector', configuration);
      assert.equal(result.valid, true);
      assert.equal(result.activationAvailable, false);
      assert.equal(result.connectionStatus, 'NOT_CONNECTED');
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('cnss-declaration-connector', {
          configuration,
          enabled: true,
          confirmConfiguration: true,
          confirmationNote: 'Tentative activation interdite.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
      );
    });
    assert.equal(result.confirmConfiguration, true);
    assert.equal(result.enable, false);

    for (const unsafeConnector of [
      { ...connector, baseUrl: 'http://api.example.tn' },
      { ...connector, baseUrl: 'https://user:password@api.example.tn' },
      { ...connector, resourcePath: '/v1/../admin' },
      { ...connector, credentialProvider: 'INLINE_TOKEN' },
      { ...connector, responseMapping: {} },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('tuneps-connector', {
          configuration: unsafeConnector,
          confirmConfiguration: true,
          confirmationNote: 'Contrat examiné par un administrateur.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
      );
    }
  });

  it('validates programmable CRM reminder schedules while keeping delivery inactive', () => {
    const policy = {
      timeZone: 'Africa/Tunis',
      localTime: '09:30',
      cadence: 'WEEKLY',
      dayOfWeek: 1,
      overdueDays: [7, 30],
      templates: [
        { overdueDays: 7, subject: 'Rappel {invoiceNumber}', body: 'Bonjour {customerName}, solde {outstandingAmount} {currencyCode}.' },
        { overdueDays: 30, subject: 'Relance {invoiceNumber}', body: 'Échéance {dueDate}, retard {daysOverdue} jours.' },
      ],
      deliveryMode: 'DRAFT_ONLY',
    };
    const result = validateWorkbookFeatureConfigurationInput('crm-reminders', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Calendrier et textes relus par le responsable des créances.',
    });
    assert.equal(result.confirmConfiguration, true);
    assert.equal(result.enable, false);

    for (const invalidPolicy of [
      { ...policy, timeZone: 'Invalid/Timezone' },
      { ...policy, dayOfWeek: 7 },
      { ...policy, overdueDays: [7, 7] },
      { ...policy, templates: policy.templates.slice(0, 1) },
      { ...policy, templates: [{ ...policy.templates[0], body: 'Bonjour {unknownField}' }, policy.templates[1]] },
      { ...policy, deliveryMode: 'EMAIL' },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('crm-reminders', {
          configuration: invalidPolicy,
          confirmConfiguration: true,
          confirmationNote: 'Calendrier et textes relus par le responsable.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
      );
    }

    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('crm-reminders', {
        configuration: policy,
        enabled: true,
        confirmConfiguration: true,
        confirmationNote: 'Calendrier et textes relus par le responsable des créances.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('validates explicit fleet alert thresholds without activating alert delivery', () => {
    const policy = {
      dateLeadDays: 30,
      odometerLeadKm: 1000,
      requireHumanReview: true,
    };
    const result = validateWorkbookFeatureConfigurationInput('fleet-maintenance-alerts', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Seuils de maintenance revus par le gestionnaire de flotte.',
    });
    assert.equal(result.confirmConfiguration, true);
    assert.equal(result.enable, false);

    for (const invalidPolicy of [
      { ...policy, dateLeadDays: -1 },
      { ...policy, odometerLeadKm: 1.5 },
      { ...policy, dateLeadDays: 0, odometerLeadKm: 0 },
      { ...policy, requireHumanReview: false },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('fleet-maintenance-alerts', {
          configuration: invalidPolicy,
          confirmConfiguration: true,
          confirmationNote: 'Seuils de maintenance revus par le gestionnaire.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
      );
    }

    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('fleet-maintenance-alerts', {
        configuration: policy,
        enabled: true,
        confirmConfiguration: true,
        confirmationNote: 'Seuils de maintenance revus par le gestionnaire de flotte.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('requires manual cloud selection and explicit disclosure while forbidding transfer', () => {
    const policy = {
      selectedProvider: 'Example Provider',
      selectedModel: 'Example Model',
      routing: 'MANUAL',
      disclosureText: 'Aucun contenu financier ne sera envoyé par cette version.',
      requireExplicitConsent: true,
      redactByDefault: true,
      allowedDataClasses: [],
      autoRouteFinancialData: false,
      automaticFallback: false,
      externalTransferEnabled: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('cloud-ai', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Politique de consentement examinée par un administrateur.',
    });
    assert.equal(result.confirmConfiguration, true);
    assert.equal(result.enable, false);

    for (const unsafePolicy of [
      { ...policy, routing: 'AUTOMATIC' },
      { ...policy, requireExplicitConsent: false },
      { ...policy, redactByDefault: false },
      { ...policy, allowedDataClasses: ['FINANCIAL'] },
      { ...policy, autoRouteFinancialData: true },
      { ...policy, automaticFallback: true },
      { ...policy, externalTransferEnabled: true },
      { ...policy, apiKey: 'must-not-be-persisted' },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('cloud-ai', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Politique cloud examinée par un administrateur.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }

    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('cloud-ai', {
        configuration: policy,
        enabled: true,
        confirmConfiguration: true,
        confirmationNote: 'Politique de consentement examinée par un administrateur.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('stores explicit project and production mappings without activating calculations', () => {
    const projectPolicy = {
      rules: [{
        sourceType: 'PURCHASE_INVOICE',
        sourceReference: 'invoice-123',
        projectReference: 'project-456',
      }],
      manualReviewRequired: true,
      calculationEnabled: false,
      automaticPosting: false,
    };
    const projectResult = validateWorkbookFeatureConfigurationInput('project-cost-allocation', {
      configuration: projectPolicy,
      confirmConfiguration: true,
      confirmationNote: 'Correspondances projet vérifiées par le responsable des coûts.',
    });
    assert.equal(projectResult.enable, false);

    const productionPolicy = {
      rules: [{
        sourceCostReference: 'cost-materials',
        componentReference: 'component-direct-materials',
        basisReference: 'source-line-amount',
      }],
      manualReviewRequired: true,
      calculationEnabled: false,
      automaticPosting: false,
    };
    const productionResult = validateWorkbookFeatureConfigurationInput('production-cost-allocation', {
      configuration: productionPolicy,
      confirmConfiguration: true,
      confirmationNote: 'Correspondances de coût vérifiées par le responsable industriel.',
    });
    assert.equal(productionResult.enable, false);

    for (const unsafePolicy of [
      { ...projectPolicy, calculationEnabled: true },
      { ...projectPolicy, automaticPosting: true },
      { ...projectPolicy, manualReviewRequired: false },
      {
        ...projectPolicy,
        rules: [...projectPolicy.rules, projectPolicy.rules[0]],
      },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('project-cost-allocation', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Correspondances vérifiées par le responsable des coûts.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });

  it('validates milestone links but refuses automatic amount calculation and posting', () => {
    const policy = {
      milestones: [{
        projectReference: 'project-456',
        milestoneReference: 'milestone-1',
        salesItemReference: 'service-789',
        amountReference: 'approved-milestone-value',
      }],
      manualReviewRequired: true,
      calculationEnabled: false,
      automaticPosting: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('project-progress-invoicing', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Références de jalon revues par le responsable de projet.',
    });
    assert.equal(result.enable, false);
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('project-progress-invoicing', {
        configuration: { ...policy, automaticPosting: true },
        confirmConfiguration: true,
        confirmationNote: 'Références de jalon revues par le responsable de projet.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('validates local cashflow horizons and explicit overdraft thresholds without enabling forecasts', () => {
    const policy = {
      modelReference: 'locally-reviewed-model',
      dataSource: 'LOCAL_POSTED_TRANSACTIONS',
      horizonsDays: [30, 60, 90],
      minimumHistoryDays: 180,
      overdraftThreshold: { currencyCode: 'TND', amount: 1000 },
      requireHumanReview: true,
      automatedAction: false,
      externalProcessing: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('cashflow-ml', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Seuil et source locale examinés par le responsable financier.',
    });
    assert.equal(result.enable, false);

    for (const unsafePolicy of [
      { ...policy, horizonsDays: [30, 60, 90, 120] },
      { ...policy, dataSource: 'CLOUD_TRANSACTIONS' },
      { ...policy, overdraftThreshold: { currencyCode: 'TND', amount: '1000' } },
      { ...policy, automatedAction: true },
      { ...policy, externalProcessing: true },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('cashflow-ml', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Politique de prévision examinée par le responsable financier.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });

  it('requires explicit local anomaly metrics and a reviewed comparison rule', () => {
    const policy = {
      modelReference: 'local-anomaly-model',
      metricReferences: ['supplier.invoice.total', 'supplier.invoice.average'],
      comparisonRuleReference: 'finance-policy-v1',
      lookbackDays: 365,
      minimumSampleCount: 20,
      requireHumanReview: true,
      automatedAction: false,
      externalProcessing: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('anomaly-ai', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Règle de comparaison et mesures examinées par le responsable.',
    });
    assert.equal(result.enable, false);
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('anomaly-ai', {
        configuration: { ...policy, metricReferences: ['supplier.invoice.total', 'supplier.invoice.total'] },
        confirmConfiguration: true,
        confirmationNote: 'Règle de comparaison examinée par le responsable.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });

  it('validates versioned fiscal form field mappings without enabling official exports', () => {
    const policy = {
      templateVersion: 'draft-1',
      sourceReference: 'https://example.test/forms/current.pdf',
      templates: [{
        documentType: 'G50',
        fields: [{ formFieldReference: 'taxpayer.id', sourceFieldReference: 'entity.taxIdentifier' }],
      }],
      humanReviewRequired: true,
      automaticPrefill: false,
      exportEnabled: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('dgi-tax-templates', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Référence et correspondances revues par le responsable fiscal.',
      sourceReference: 'Modèle fourni par le responsable, à vérifier avec la DGI.',
    });
    assert.equal(result.enable, false);

    for (const unsafePolicy of [
      { ...policy, sourceReference: 'http://example.test/form.pdf' },
      { ...policy, automaticPrefill: true },
      { ...policy, exportEnabled: true },
      {
        ...policy,
        templates: [{ ...policy.templates[0], fields: [
          ...policy.templates[0].fields,
          policy.templates[0].fields[0],
        ] }],
      },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('dgi-tax-templates', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Gabarit examiné par le responsable fiscal.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });

  it('validates Arabic RTL labels and keeps bilingual PDF rendering disabled', () => {
    const policy = {
      templateVersion: 'ar-draft-1',
      sourceReference: 'https://example.test/template.pdf',
      labels: [{ fieldReference: 'invoice.total', fr: 'Total', ar: 'المجموع' }],
      rtlArabic: true,
      latinNumbersLtr: true,
      humanReviewRequired: true,
      renderingEnabled: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('arabic-pdf-templates', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Libellés et sens de lecture revus avant toute exportation.',
    });
    assert.equal(result.enable, false);
    assert.throws(
      () => validateWorkbookFeatureConfigurationInput('arabic-pdf-templates', {
        configuration: { ...policy, renderingEnabled: true },
        confirmConfiguration: true,
        confirmationNote: 'Gabarit bilingue vérifié par le responsable documentaire.',
      }),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 409,
    );
  });

  it('requires consent and minimal payloads while keeping approval push delivery disabled', () => {
    const policy = {
      providerReference: 'organization.push-service',
      publicKeyReference: 'secret-manager.vapid-public-key',
      privateKeyProvider: 'SECRET_MANAGER',
      events: ['APPROVAL_REQUEST', 'APPROVAL_DECISION'],
      payloadMode: 'MINIMAL',
      requireUserConsent: true,
      includeFinancialDetails: false,
      deliveryEnabled: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('push-notifications', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Politique de consentement et confidentialité revue par l’administrateur.',
    });
    assert.equal(result.enable, false);

    for (const unsafePolicy of [
      { ...policy, requireUserConsent: false },
      { ...policy, includeFinancialDetails: true },
      { ...policy, deliveryEnabled: true },
      { ...policy, events: ['APPROVAL_REQUEST', 'APPROVAL_REQUEST'] },
      { ...policy, privateKey: 'must-not-be-stored' },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('push-notifications', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Politique de notification revue par l’administrateur.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });

  it('validates customs transformation field references without inventing or executing a formula', () => {
    const policy = {
      formulaReference: 'customs-conversion-rule-2026',
      sourceReference: 'official-tariff-validation-pending',
      inputFields: [
        { fieldReference: 'input.quantity', unitReference: 'unit.input' },
        { fieldReference: 'output.quantity', unitReference: 'unit.output' },
      ],
      resultFieldReference: 'transformation.rate',
      resultUnitReference: 'unit.rate',
      manualReviewRequired: true,
      calculationEnabled: false,
      declarationExportEnabled: false,
    };
    const result = validateWorkbookFeatureConfigurationInput('customs-transformation', {
      configuration: policy,
      confirmConfiguration: true,
      confirmationNote: 'Référence, unités et formule à vérifier par le responsable douanier.',
    });
    assert.equal(result.enable, false);

    for (const unsafePolicy of [
      { ...policy, calculationEnabled: true },
      { ...policy, declarationExportEnabled: true },
      { ...policy, inputFields: policy.inputFields.slice(0, 1) },
      { ...policy, resultFieldReference: policy.inputFields[0].fieldReference },
      { ...policy, sourceReference: '' },
    ]) {
      assert.throws(
        () => validateWorkbookFeatureConfigurationInput('customs-transformation', {
          configuration: unsafePolicy,
          confirmConfiguration: true,
          confirmationNote: 'Référence et formule vérifiées par le responsable douanier.',
        }),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError
          && (error.statusCode === 400 || error.statusCode === 409),
      );
    }
  });
});
