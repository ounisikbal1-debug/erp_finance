import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { WithholdingCertificateError } from '../../../application/modules/taxation/certificates';
import { TaxDeclarationError } from '../../../application/modules/taxation/declaration';
import TaxationService from '../../../application/modules/taxation/service';
import { WithholdingInputError } from '../../../application/modules/taxation/withholding';
import { TaxDeclarationWorkpaperError } from '../../../application/modules/taxation/workpapers';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function handleCertificateError(error: unknown, res: Response, action: string) {
  const message = error instanceof Error ? error.message : 'Erreur inattendue';
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: message });
    return;
  }
  if (error instanceof WithholdingCertificateError
    || error instanceof TaxDeclarationError
    || error instanceof TaxDeclarationWorkpaperError) {
    res.status(error.statusCode).json({ error: message });
    return;
  }
  console.error(`Erreur lors de l’opération de certificat RS (${action}):`, error);
  res.status(500).json({ error: 'Impossible de traiter le certificat de retenue.' });
}

router.get('/declaration-workpapers', async (req, res) => {
  try {
    const workpapers = await TaxationService.getTaxDeclarationWorkpapers(
      getScopedEntity(res, req.query.entityId),
      getActor(res),
      req.query.period,
    );
    res.json(workpapers);
  } catch (error) {
    handleCertificateError(error, res, 'workpaper-list');
  }
});

router.post('/declaration-workpapers', async (req, res) => {
  try {
    const workpaper = await TaxationService.recordTaxDeclarationWorkpaper(
      req.body,
      getScopedEntity(res),
      getActor(res),
    );
    res.status(201).json(workpaper);
  } catch (error) {
    handleCertificateError(error, res, 'workpaper-record');
  }
});

router.get('/declaration-g50', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const declaration = await TaxationService.getMonthlyTaxDeclaration(req.query.period, entityId);
    res.json(declaration);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inattendue';
    if (error instanceof EntityScopeError) {
      res.status(403).json({ error: message });
      return;
    }
    if (error instanceof TaxDeclarationError) {
      res.status(error.statusCode).json({ error: message });
      return;
    }
    console.error('Erreur lors du calcul de la déclaration fiscale:', error);
    res.status(500).json({ error: 'Impossible de calculer la déclaration fiscale.' });
  }
});

router.get('/withholding-rules', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const catalog = await TaxationService.getWithholdingRuleCatalog(entityId);
    res.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inattendue';
    if (error instanceof EntityScopeError) {
      res.status(403).json({ error: message });
      return;
    }
    if (error instanceof TaxDeclarationError) {
      res.status(error.statusCode).json({ error: message });
      return;
    }
    console.error('Erreur lors de la lecture des règles de retenue:', error);
    res.status(500).json({ error: 'Impossible de lire les règles de retenue.' });
  }
});

router.post('/withholding-preview', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const preview = await TaxationService.calculateWithholdingPreview(req.body, entityId);
    res.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inattendue';
    if (error instanceof EntityScopeError) {
      res.status(403).json({ error: message });
      return;
    }
    if (error instanceof TaxDeclarationError) {
      res.status(error.statusCode).json({ error: message });
      return;
    }
    if (error instanceof WithholdingInputError) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Erreur lors de l’aperçu des retenues:', error);
    res.status(500).json({ error: 'Impossible de calculer l’aperçu de retenue.' });
  }
});

router.get('/withholding-certificates', async (req, res) => {
  try {
    const certificates = await TaxationService.getWithholdingCertificates(
      getScopedEntity(res, req.query.entityId),
      getActor(res),
      req.query.period,
    );
    res.json(certificates);
  } catch (error) {
    handleCertificateError(error, res, 'list');
  }
});

router.post('/withholding-certificates', async (req, res) => {
  try {
    const certificate = await TaxationService.prepareWithholdingCertificate(
      req.body,
      getScopedEntity(res),
      getActor(res),
    );
    res.status(201).json(certificate);
  } catch (error) {
    handleCertificateError(error, res, 'prepare');
  }
});

router.post('/withholding-certificates/:id/issue', async (req, res) => {
  try {
    const certificate = await TaxationService.transitionWithholdingCertificate(
      req.params.id,
      getScopedEntity(res),
      'ISSUE',
      getActor(res),
    );
    res.json(certificate);
  } catch (error) {
    handleCertificateError(error, res, 'issue');
  }
});

router.post('/withholding-certificates/:id/cancel', async (req, res) => {
  try {
    const certificate = await TaxationService.transitionWithholdingCertificate(
      req.params.id,
      getScopedEntity(res),
      'CANCEL',
      getActor(res),
      req.body?.reason,
    );
    res.json(certificate);
  } catch (error) {
    handleCertificateError(error, res, 'cancel');
  }
});

router.post('/withholding-certificates/:id/revoke', async (req, res) => {
  try {
    const certificate = await TaxationService.transitionWithholdingCertificate(
      req.params.id,
      getScopedEntity(res),
      'REVOKE',
      getActor(res),
      req.body?.reason,
    );
    res.json(certificate);
  } catch (error) {
    handleCertificateError(error, res, 'revoke');
  }
});

export default router;
