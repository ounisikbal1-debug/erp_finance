import { raw, Router, type Request, type Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { HrRequestError } from '../../../application/modules/hr/errors';
import { getHrErrorResponse } from '../../../application/modules/hr/errors';
import HrService from '../../../application/modules/hr/service';
import { assertCanManagePayrollRubriques } from '../../../application/modules/hr/payroll-rubriques';
import HrLeaveRequestService from '../../../application/modules/hr/leave-requests/service';
import { validateHrLeaveYear } from '../../../application/modules/hr/leave-requests/validation';
import HrWorkflowService from '../../../application/modules/hr/workflow-service';
import {
  MAX_HR_DOCUMENT_BYTES,
  readPrivateHrDocument,
} from '../../../application/modules/hr/employee-document-storage';

const router = Router();

function getScopedEntity(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null);
}

function getActor(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user?.id || !user.username) {
    throw new HrRequestError('Une identité authentifiée est requise.', 403);
  }
  return { id: user.id, username: user.username };
}

function respondError(res: Response, error: unknown) {
  const response = getHrErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans le module RH:', error);
  res.status(response.status).json({ error: response.message });
}

const parseEmployeeDocumentUpload = raw({
  type: 'application/octet-stream',
  limit: MAX_HR_DOCUMENT_BYTES,
  inflate: false,
});

function parseEmployeeDocumentUploadBody(req: Request, res: Response, next: (error?: unknown) => void) {
  parseEmployeeDocumentUpload(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const type = error && typeof error === 'object' && 'type' in error ? error.type : null;
    if (type === 'entity.too.large') {
      respondError(res, new HrRequestError('Le fichier RH dépasse la limite de 8 Mio.', 413));
      return;
    }
    if (type === 'encoding.unsupported') {
      respondError(res, new HrRequestError('Les corps de téléversement compressés ne sont pas acceptés.', 415));
      return;
    }
    respondError(res, new HrRequestError('Le corps du téléversement RH est invalide.', 400));
  });
}

function getDocumentId(req: Request): string {
  const documentId = req.params.id;
  if (typeof documentId !== 'string') throw new HrRequestError('Identifiant de document RH invalide.', 400);
  return documentId;
}

// ----------------- SALARIÉS (RESSOURCES HUMAINES SAFE ERP) -----------------

router.get('/employees', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const list = await HrService.listEmployees(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/employees', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const emp = await HrService.createEmployee(req.body, entityId);
    res.status(201).json(emp);
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/employees/:id/termination', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await HrService.updateEmployeeTermination(
      req.params.id,
      entityId,
      req.body,
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const deleted = await HrService.deleteEmployee(req.params.id, entityId);
    res.json({ message: 'Employé supprimé avec succès', employee: deleted });
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- MÉTADONNÉES DE DOCUMENTS DU PERSONNEL -----------------

router.get('/documents', async (_req, res) => {
  try {
    res.json(await HrWorkflowService.listEmployeeDocuments(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/documents', async (req, res) => {
  try {
    res.status(201).json(await HrWorkflowService.createEmployeeDocument(
      req.body,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/documents/:id/archive', async (req, res) => {
  try {
    res.json(await HrWorkflowService.archiveEmployeeDocument(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      req.body?.note,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/documents/:id', async (req, res) => {
  try {
    res.json(await HrWorkflowService.updateEmployeeDocument(
      req.params.id,
      req.body,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/documents/:id/file', parseEmployeeDocumentUploadBody, async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new HrRequestError('Envoyez un fichier binaire avec Content-Type application/octet-stream.', 400);
    }
    res.status(201).json(await HrWorkflowService.uploadEmployeeDocumentFile(
      getDocumentId(req),
      getScopedEntity(res),
      getActor(res),
      req.body,
      req.header('x-hr-document-mime-type'),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const file = await HrWorkflowService.getEmployeeDocumentFile(getDocumentId(req), getScopedEntity(res));
    const content = await readPrivateHrDocument(file.storageKey, file.sizeBytes, file.sha256);
    const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    res
      .status(200)
      .set({
        'Content-Type': file.mimeType,
        'Content-Length': String(content.length),
        'Content-Disposition': `attachment; filename="document-rh.${extension}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(content);
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- RECRUTEMENT & ENTRETIENS -----------------

router.get('/recruitment/positions', async (_req, res) => {
  try {
    res.json(await HrWorkflowService.listRecruitmentPositions(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/recruitment/positions', async (req, res) => {
  try {
    res.status(201).json(await HrWorkflowService.createRecruitmentPosition(
      req.body,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/recruitment/positions/:id/close', async (req, res) => {
  try {
    res.json(await HrWorkflowService.closeRecruitmentPosition(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/recruitment/positions/:id/applications', async (req, res) => {
  try {
    res.status(201).json(await HrWorkflowService.createCandidateApplication(
      { ...req.body, positionId: req.params.id },
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/recruitment/applications/:id/status', async (req, res) => {
  try {
    res.json(await HrWorkflowService.changeCandidateStatus(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      req.body?.status,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/recruitment/applications/:id/anonymize', async (req, res) => {
  try {
    res.json(await HrWorkflowService.anonymizeCandidateApplication(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/recruitment/interviews', async (_req, res) => {
  try {
    res.json(await HrWorkflowService.listCandidateInterviews(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/recruitment/applications/:id/interviews', async (req, res) => {
  try {
    res.status(201).json(await HrWorkflowService.scheduleCandidateInterview(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      req.body?.scheduledAt,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/recruitment/interviews/:id/status', async (req, res) => {
  try {
    res.json(await HrWorkflowService.changeCandidateInterviewStatus(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      req.body?.status,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- NOTES DE FRAIS (SANS COMPTABILISATION) -----------------

router.get('/expense-claims', async (_req, res) => {
  try {
    res.json(await HrWorkflowService.listExpenseClaims(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/expense-claims/employees', async (_req, res) => {
  try {
    res.json(await HrWorkflowService.listExpenseClaimEmployees(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/expense-claims', async (req, res) => {
  try {
    res.status(201).json(await HrWorkflowService.createExpenseClaim(
      req.body,
      getScopedEntity(res),
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/expense-claims/:id/approve', async (req, res) => {
  try {
    res.json(await HrWorkflowService.reviewExpenseClaim(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      'APPROVED',
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/expense-claims/:id/reject', async (req, res) => {
  try {
    res.json(await HrWorkflowService.reviewExpenseClaim(
      req.params.id,
      getScopedEntity(res),
      getActor(res),
      'REJECTED',
    ));
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- DEMANDES DE CONGÉ -----------------

router.get('/leave-requests', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await HrLeaveRequestService.list(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/leave-entitlements', async (req, res) => {
  try {
    res.json(await HrLeaveRequestService.listEntitlements(
      getScopedEntity(res),
      validateHrLeaveYear(req.query.year),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/leave-entitlements', async (req, res) => {
  try {
    res.json(await HrLeaveRequestService.setEntitlement(req.body, getScopedEntity(res), getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/leave-requests', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user) throw new HrRequestError('Authentification requise.', 403);
    res.status(201).json(await HrLeaveRequestService.create(req.body, entityId, user.id));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/leave-requests/:id/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user) throw new HrRequestError('Authentification requise.', 403);
    res.json(await HrLeaveRequestService.review(req.params.id, entityId, user.id, 'APPROVED', req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/leave-requests/:id/reject', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user) throw new HrRequestError('Authentification requise.', 403);
    res.json(await HrLeaveRequestService.review(req.params.id, entityId, user.id, 'REJECTED', req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- RUBRIQUES SPÉCIFIQUES DE PAIE -----------------

router.get('/rubriques', async (_req, res) => {
  try {
    const list = await HrService.listRubriques(_req.query.countryCode);
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/rubriques', async (req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    assertCanManagePayrollRubriques(user?.role);
    const created = await HrService.createCountryRubrique(req.body?.countryCode, req.body?.rubrique);
    res.status(201).json(created);
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/rubriques/:countryCode', async (req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    assertCanManagePayrollRubriques(user?.role);
    const saved = await HrService.saveCountryRubriques(req.params.countryCode, req.body?.rubriques);
    res.json(saved);
  } catch (error) {
    respondError(res, error);
  }
});

router.delete('/rubriques/:id', async (req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    assertCanManagePayrollRubriques(user?.role);
    const deleted = await HrService.deleteCountryRubrique(req.query.countryCode, req.params.id);
    res.json({ message: 'Rubrique supprimée', rubrique: deleted });
  } catch (error) {
    respondError(res, error);
  }
});

// ----------------- CALCUL & SIMULATION DE PAIE -----------------

router.get('/payroll-availability', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await HrService.getPayrollAvailability(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const result = await HrService.simulatePayroll(req.body, entityId);
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/payslips', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const { employeeId, period, rubriques } = req.body;
    const payslip = await HrService.generatePayslip(employeeId, entityId, period, rubriques);
    res.status(201).json(payslip);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/payslips', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const list = await HrService.listPayslips(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/payroll-register', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await HrService.getPayrollRegister(entityId, req.query.period));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
