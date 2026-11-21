import { Router, type Response } from 'express';
import { getAccessPolicySnapshot, type AuthenticatedUser } from '../../../application/auth';
import AdminLocalizationService, {
  AdminCountryNotFoundError,
  AdminRegulatoryRevisionNotFoundError,
} from '../../../application/modules/admin/service';
import { AdminUserError, AdminUserService } from '../../../application/modules/admin/users';
import { CustomsTariffError } from '../../../application/modules/customs/tariff';
import { CustomsTariffService } from '../../services/customs/service';
import {
  listWorkbookFeatureConfigurations,
  listWorkbookFeatureConfigurationRevisions,
  saveWorkbookFeatureConfiguration,
  validateWorkbookFeatureConfigurationDraft,
  WorkbookFeatureConfigurationError,
} from '../../../application/modules/admin/workbook-features';
import {
  calculateAndPersistWorkbookScore,
  isWorkbookScoreSubjectType,
  listWorkbookScoreHistory,
} from '../../../application/modules/admin/workbook-score-service';
import { isWorkbookScoreMetrics } from '../../../application/modules/admin/workbook-scoring';
import { CountryConfigurationValidationError } from '../../../application/modules/admin/country-configuration';
import { CountryTaxRuleValidationError } from '../../../application/modules/admin/country-tax-rules';
import {
  CountryTaxRuleCountryNotFoundError,
  CountryTaxRuleNotFoundError,
  CountryTaxRuleService,
} from '../../../application/modules/admin/country-tax-rule-service';
import { RegulatoryRevisionValidationError } from '../../../application/modules/admin/regulatory-revisions';
import {
  createWorkbookPartnerDispute,
  listWorkbookPartnerDisputes,
  resolveWorkbookPartnerDispute,
} from '../../../application/modules/admin/workbook-partner-data';
import { GovernanceSodService } from '../../../application/modules/admin/governance-service';

const governanceService = new GovernanceSodService();
import {
  deleteWorkbookConnectorCredentials,
  getWorkbookConnectorCredentialStatus,
  saveWorkbookConnectorCredentialField,
  testWorkbookConnectorConnection,
} from '../../../application/modules/admin/workbook-connector-vault';

const router = Router();

function logUnexpectedCountryError(context: string, error: unknown) {
  const errorCode = error !== null && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string'
    && /^P\d{4}$/.test(error.code)
    ? error.code
    : undefined;
  console.error(context, {
    errorType: error instanceof Error ? error.name : 'UnknownError',
    ...(errorCode ? { errorCode } : {}),
  });
}

function respondCountryConfigurationError(
  res: Response,
  error: unknown,
  context: string,
  fallbackMessage: string,
) {
  if (error instanceof AdminCountryNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CountryConfigurationValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  logUnexpectedCountryError(context, error);
  res.status(500).json({ error: fallbackMessage });
}

function respondRegulatoryRevisionError(res: Response, error: unknown, context: string) {
  if (error instanceof AdminCountryNotFoundError || error instanceof AdminRegulatoryRevisionNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof RegulatoryRevisionValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  logUnexpectedCountryError(context, error);
  res.status(500).json({ error: 'Impossible de traiter la révision réglementaire.' });
}

function respondCountryTaxRuleError(res: Response, error: unknown, context: string) {
  if (error instanceof CountryTaxRuleCountryNotFoundError || error instanceof CountryTaxRuleNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CountryTaxRuleValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  logUnexpectedCountryError(context, error);
  res.status(500).json({ error: 'Impossible de traiter la règle fiscale.' });
}

function requireEntityAdmin(
  actor: AuthenticatedUser | undefined,
  entityId: string,
  res: Response,
): actor is AuthenticatedUser {
  if (!actor) {
    res.status(401).json({ error: 'Authentification requise.' });
    return false;
  }
  if (actor.role !== 'ADMIN' || actor.entityId !== entityId) {
    res.status(403).json({ error: 'Accès interdit pour ce rôle ou cette entité.' });
    return false;
  }
  return true;
}

router.get('/users', async (_req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) { res.status(401).json({ error: 'Authentification requise.' }); return; }
    res.json(await AdminUserService.list(actor.id));
  } catch (error) {
    const status = error instanceof AdminUserError ? error.status : 500;
    if (status === 500) console.error('Erreur inattendue dans l’administration des utilisateurs:', error);
    res.status(status).json({ error: error instanceof AdminUserError ? error.message : 'Impossible de charger les utilisateurs.' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id || !actor.username) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.status(201).json(await AdminUserService.create(req.body, { id: actor.id, username: actor.username }));
  } catch (error) {
    const status = error instanceof AdminUserError ? error.status : 500;
    if (status === 500) console.error('Erreur inattendue pendant la création du compte utilisateur:', error);
    res.status(status).json({ error: error instanceof AdminUserError ? error.message : 'Impossible de créer le compte utilisateur.' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.json(await AdminUserService.update(req.params.id, req.body, { id: actor.id, username: actor.username }));
  } catch (error) {
    const status = error instanceof AdminUserError ? error.status : 500;
    if (status === 500) console.error('Erreur inattendue pendant la mise à jour du compte utilisateur:', error);
    res.status(status).json({ error: error instanceof AdminUserError ? error.message : 'Impossible de mettre à jour le compte utilisateur.' });
  }
});

router.put('/users/:id/password', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id || !actor.username) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.json(await AdminUserService.resetPassword(req.params.id, req.body, {
      id: actor.id,
      username: actor.username,
    }));
  } catch (error) {
    const status = error instanceof AdminUserError ? error.status : 500;
    if (status === 500) console.error('Erreur inattendue pendant la réinitialisation du mot de passe utilisateur:', error);
    res.status(status).json({
      error: error instanceof AdminUserError ? error.message : 'Impossible de réinitialiser le mot de passe utilisateur.',
    });
  }
});

router.put('/users/:id/status', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id || !actor.username) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.json(await AdminUserService.setActive(req.params.id, req.body, {
      id: actor.id,
      username: actor.username,
    }));
  } catch (error) {
    const status = error instanceof AdminUserError ? error.status : 500;
    if (status === 500) console.error('Erreur inattendue pendant le changement de statut du compte utilisateur:', error);
    res.status(status).json({
      error: error instanceof AdminUserError ? error.message : 'Impossible de modifier le statut du compte utilisateur.',
    });
  }
});

router.get('/access-policies', (_req, res) => {
  res.json(getAccessPolicySnapshot());
});

router.get('/workbook-features/:entityId', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await listWorkbookFeatureConfigurations(req.params.entityId));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue des configurations de fonctionnalités:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de charger les configurations des fonctionnalités.',
    });
  }
});

router.post('/workbook-features/:entityId/:key/validate', (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(validateWorkbookFeatureConfigurationDraft(req.params.key, req.body?.configuration));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la validation d’une configuration:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de valider la configuration.',
    });
  }
});

router.get('/workbook-features/:entityId/:key/credentials', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    res.set('Cache-Control', 'no-store');
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await getWorkbookConnectorCredentialStatus(req.params.entityId, req.params.key));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la lecture du statut d’identifiants connecteur:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de lire le statut des identifiants.',
    });
  }
});

router.put('/workbook-features/:entityId/:key/credentials', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    res.set('Cache-Control', 'no-store');
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await saveWorkbookConnectorCredentialField(
      req.params.entityId,
      req.params.key,
      req.body?.fieldName,
      req.body?.value,
      { id: actor.id, username: actor.username },
    ));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant le chiffrement des identifiants connecteur.');
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de chiffrer les identifiants.',
    });
  }
});

router.delete('/workbook-features/:entityId/:key/credentials', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    res.set('Cache-Control', 'no-store');
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await deleteWorkbookConnectorCredentials(req.params.entityId, req.params.key));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la suppression des identifiants connecteur:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de supprimer les identifiants.',
    });
  }
});

router.post('/workbook-features/:entityId/:key/test-connection', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    res.set('Cache-Control', 'no-store');
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await testWorkbookConnectorConnection(req.params.entityId, req.params.key));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la vérification des prérequis du connecteur:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de vérifier les prérequis du connecteur.',
    });
  }
});

router.get('/workbook-features/:entityId/:key/revisions', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await listWorkbookFeatureConfigurationRevisions(req.params.entityId, req.params.key));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant le chargement de l’historique de configuration:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de charger l’historique de configuration.',
    });
  }
});

router.put('/workbook-features/:entityId/:key', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await saveWorkbookFeatureConfiguration(
      req.params.entityId,
      req.params.key,
      req.body,
      { id: actor.id, username: actor.username },
    ));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la configuration d’une fonctionnalité:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible d’enregistrer la configuration de la fonctionnalité.',
    });
  }
});

router.get('/workbook-features/:entityId/disputes/:partnerType/:partnerId', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await listWorkbookPartnerDisputes({
      entityId: req.params.entityId,
      partnerType: req.params.partnerType,
      partnerId: req.params.partnerId,
    }));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue des litiges partenaires:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de charger les litiges partenaires.',
    });
  }
});

router.post('/workbook-features/:entityId/disputes', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.status(201).json(await createWorkbookPartnerDispute(
      req.params.entityId,
      req.body,
      { id: actor.id, username: actor.username },
    ));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant l’enregistrement d’un litige partenaire:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible d’enregistrer le litige partenaire.',
    });
  }
});

router.put('/workbook-features/:entityId/disputes/:id/status', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    res.json(await resolveWorkbookPartnerDispute(
      req.params.entityId,
      req.params.id,
      req.body,
      { id: actor.id, username: actor.username },
    ));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la clôture d’un litige partenaire:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de clôturer le litige partenaire.',
    });
  }
});

router.post('/workbook-features/:entityId/scores', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    const isHealthScore = req.body?.subjectType === 'HEALTH';
    if (!isWorkbookScoreSubjectType(req.body?.subjectType)
      || typeof req.body?.partnerId !== 'string'
      || !req.body.partnerId
      || (isHealthScore
        ? req.body.partnerId !== req.params.entityId
          || !isWorkbookScoreMetrics(req.body?.metrics)
          || typeof req.body?.sourceReference !== 'string'
        : Object.prototype.hasOwnProperty.call(req.body ?? {}, 'metrics')
          || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'sourceReference'))) {
      res.status(400).json({ error: 'Le sujet et les mesures du score sont invalides.' });
      return;
    }
    res.status(201).json(await calculateAndPersistWorkbookScore({
      entityId: req.params.entityId,
      subjectType: req.body.subjectType,
      partnerId: req.body.partnerId,
      ...(isHealthScore ? {
        metrics: req.body.metrics,
        sourceReference: req.body.sourceReference,
        calculatedBy: actor?.username,
      } : {}),
    }));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant le calcul du score:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de calculer le score.',
    });
  }
});

router.get('/workbook-features/:entityId/scores/:subjectType/:partnerId', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!requireEntityAdmin(actor, req.params.entityId, res)) return;
    if (!isWorkbookScoreSubjectType(req.params.subjectType)) {
      res.status(400).json({ error: 'Le type de score est invalide.' });
      return;
    }
    res.json(await listWorkbookScoreHistory({
      entityId: req.params.entityId,
      subjectType: req.params.subjectType,
      partnerId: req.params.partnerId,
    }));
  } catch (error) {
    const status = error instanceof WorkbookFeatureConfigurationError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant le chargement de l’historique de score:', error);
    res.status(status).json({
      error: error instanceof WorkbookFeatureConfigurationError ? error.message : 'Impossible de charger l’historique de score.',
    });
  }
});

router.get('/countries', async (_req, res) => {
  try {
    const list = await AdminLocalizationService.listCountries();
    res.json(list);
  } catch (error) {
    logUnexpectedCountryError('Erreur inattendue pendant le chargement des pays:', error);
    res.status(500).json({ error: 'Impossible de charger la liste des pays.' });
  }
});

router.get('/countries/:code', async (req, res) => {
  try {
    const country = await AdminLocalizationService.getCountryByCode(req.params.code.toUpperCase());
    res.json(country);
  } catch (error) {
    if (error instanceof AdminCountryNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    logUnexpectedCountryError('Erreur inattendue pendant le chargement du pays:', error);
    res.status(500).json({ error: 'Impossible de charger la configuration du pays.' });
  }
});

router.get('/countries/:code/tax-rules', async (req, res) => {
  try {
    res.json(await CountryTaxRuleService.list(req.params.code.toUpperCase()));
  } catch (error) {
    respondCountryTaxRuleError(res, error, 'Erreur inattendue pendant le chargement des règles fiscales structurées:');
  }
});

router.post('/countries/:code/tax-rules', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.status(201).json(await CountryTaxRuleService.create(
      req.params.code.toUpperCase(),
      req.body,
      actor.id,
    ));
  } catch (error) {
    respondCountryTaxRuleError(res, error, 'Erreur inattendue pendant la création d’une règle fiscale structurée:');
  }
});

router.post('/countries/:code/tax-rules/:ruleId/calculate', async (req, res) => {
  try {
    res.json(await CountryTaxRuleService.calculate(
      req.params.code.toUpperCase(),
      req.params.ruleId,
      req.body,
    ));
  } catch (error) {
    respondCountryTaxRuleError(res, error, 'Erreur inattendue pendant le calcul d’une règle fiscale structurée:');
  }
});

router.get('/countries/:code/customs-tariffs', async (req, res) => {
  try {
    res.json(await CustomsTariffService.list(req.params.code.toUpperCase()));
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue des barèmes douaniers:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible de charger les barèmes douaniers.' });
  }
});

router.post('/countries/:code/customs-tariffs/import-preview', async (req, res) => {
  try {
    const preview = await CustomsTariffService.previewCsvImport({
      ...req.body,
      countryCode: req.params.code.toUpperCase(),
    });
    const { records: _records, ...summary } = preview;
    res.json(summary);
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant l’aperçu du fichier douanier:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible de prévisualiser le fichier de barèmes.' });
  }
});

router.post('/countries/:code/customs-tariffs/import', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.status(201).json(await CustomsTariffService.importCsvDrafts(
      req.params.code.toUpperCase(),
      req.body,
      actor.id,
    ));
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant l’import des barèmes douaniers:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible d’importer les brouillons de barèmes.' });
  }
});

router.post('/countries/:code/customs-tariffs', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.status(201).json(await CustomsTariffService.createDraft(req.params.code.toUpperCase(), req.body, actor.id));
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la création du barème douanier:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible de créer le barème douanier.' });
  }
});

router.post('/countries/:code/customs-tariffs/:id/verify', async (req, res) => {
  try {
    const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!actor?.id) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.json(await CustomsTariffService.verifyDraft(
      req.params.code.toUpperCase(),
      req.params.id,
      actor.id,
      req.body?.verificationConfirmed,
    ));
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant la vérification du barème douanier:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible de vérifier le barème douanier.' });
  }
});

router.post('/countries/:code/customs-tariffs/calculate', async (req, res) => {
  try {
    res.json(await CustomsTariffService.calculate(req.params.code.toUpperCase(), req.body));
  } catch (error) {
    const status = error instanceof CustomsTariffError ? error.statusCode : 500;
    if (status === 500) console.error('Erreur inattendue pendant le calcul douanier:', error);
    res.status(status).json({ error: error instanceof CustomsTariffError ? error.message : 'Impossible de calculer les droits et taxes douaniers.' });
  }
});

router.put('/countries/:code', async (req, res) => {
  try {
    const updated = await AdminLocalizationService.updateCountryProfile(req.params.code.toUpperCase(), req.body);
    res.json(updated);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la mise à jour de la configuration pays:',
      'Impossible de mettre à jour la configuration du pays.',
    );
  }
});

router.put('/countries/:code/payroll', async (req, res) => {
  try {
    const updated = await AdminLocalizationService.updatePayrollConfig(req.params.code.toUpperCase(), req.body);
    res.json(updated);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la mise à jour de la configuration de paie:',
      'Impossible de mettre à jour la configuration de paie.',
    );
  }
});

router.put('/countries/:code/tax-brackets', async (req, res) => {
  try {
    const updated = await AdminLocalizationService.updateTaxBrackets(req.params.code.toUpperCase(), req.body.brackets);
    res.json(updated);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la mise à jour des tranches:',
      'Impossible de mettre à jour les tranches fiscales.',
    );
  }
});

router.put('/countries/:code/tax-rates', async (req, res) => {
  try {
    const updated = await AdminLocalizationService.updateTaxRates(req.params.code.toUpperCase(), req.body.rates);
    res.json(updated);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la mise à jour des taux:',
      'Impossible de mettre à jour les taux fiscaux.',
    );
  }
});

router.put('/countries/:code/accounts', async (req, res) => {
  try {
    const updated = await AdminLocalizationService.updateCountryAccounts(
      req.params.code.toUpperCase(),
      req.body.accounts,
    );
    res.json(updated);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la mise à jour du plan pays:',
      'Impossible de mettre à jour le plan comptable du pays.',
    );
  }
});

router.get('/countries/:code/revisions', async (req, res) => {
  try {
    const revisions = await AdminLocalizationService.listRegulatoryRevisions(req.params.code.toUpperCase());
    res.json(revisions);
  } catch (error) {
    if (error instanceof AdminCountryNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    logUnexpectedCountryError('Erreur inattendue pendant le chargement des révisions réglementaires:', error);
    res.status(500).json({ error: 'Impossible de charger l’historique des révisions réglementaires.' });
  }
});

router.post('/countries/:code/revisions', async (req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user?.username) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    const revision = await AdminLocalizationService.createRegulatoryRevision(
      req.params.code.toUpperCase(),
      req.body,
      user.username,
    );
    res.status(201).json(revision);
  } catch (error) {
    respondRegulatoryRevisionError(
      res,
      error,
      'Erreur inattendue pendant la création d’une révision réglementaire:',
    );
  }
});

router.put('/countries/:code/revisions/:id/status', async (req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user?.username) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    const revision = await AdminLocalizationService.transitionRegulatoryRevision(
      req.params.code.toUpperCase(),
      req.params.id,
      req.body?.status,
      user.username,
      req.body?.note,
    );
    res.json(revision);
  } catch (error) {
    respondRegulatoryRevisionError(
      res,
      error,
      'Erreur inattendue pendant la transition d’une révision réglementaire:',
    );
  }
});

router.post('/countries', async (req, res) => {
  try {
    const created = await AdminLocalizationService.createCountry(req.body);
    res.status(201).json(created);
  } catch (error) {
    respondCountryConfigurationError(
      res,
      error,
      'Erreur inattendue pendant la création du pays:',
      'Impossible de créer le pays.',
    );
  }
});

// Gouvernance SAFE: Audit de séparation des tâches (SoD)
router.post('/governance/sod-audit', (req, res) => {
  try {
    const { user } = req.body ?? {};
    if (!user || !Array.isArray(user.assignedFunctions)) {
      res.status(400).json({ error: 'user et assignedFunctions sont requis.' });
      return;
    }
    const result = governanceService.auditUserSod(user);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de réaliser l’audit SoD.' });
  }
});

// Gouvernance SAFE: Vérification des pouvoirs de signature & seuils d'engagement
router.post('/governance/spending-check', (req, res) => {
  try {
    const { amountDt, userRole } = req.body ?? {};
    if (amountDt === undefined || !userRole) {
      res.status(400).json({ error: 'amountDt et userRole sont requis.' });
      return;
    }
    const result = governanceService.checkSpendingAuthorization(Number(amountDt), String(userRole));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de vérifier l’autorisation de dépense.' });
  }
});

export default router;
