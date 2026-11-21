import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import { MaintenanceService } from '../service';
import { PrismaMaintenanceRepository } from '../repository';
import { MaintenanceRequestError } from '../validation';

function getScopedEntity(res: Response): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof MaintenanceRequestError) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le module de maintenance:', error);
    res.status(500).json({ error: 'Impossible de traiter la demande de maintenance.' });
  }
}

export function createMaintenanceRouter(service: MaintenanceService) {
  const router = Router();

  router.get('/equipment', async (_req, res) => {
    try {
      res.json(await service.listEquipment(getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/employees', async (_req, res) => {
    try {
      res.json(await service.listEmployees(getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/equipment', async (req, res) => {
    try {
      const equipment = await service.createEquipment(req.body, getScopedEntity(res));
      res.status(201).json(equipment);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.patch('/equipment/:id/vehicle', async (req, res) => {
    try {
      const equipment = await service.updateVehicleData(
        req.params.id,
        req.body,
        getScopedEntity(res),
      );
      res.json(equipment);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/work-orders', async (_req, res) => {
    try {
      res.json(await service.listWorkOrders(getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/work-orders', async (req, res) => {
    try {
      const order = await service.createWorkOrder(req.body, getScopedEntity(res));
      res.status(201).json(order);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.patch('/work-orders/:id/status', async (req, res) => {
    try {
      const order = await service.updateWorkOrderStatus(
        req.params.id,
        req.body?.status,
        getScopedEntity(res),
        req.body,
      );
      res.json(order);
    } catch (error) {
      respondError(res, error);
    }
  });

  return router;
}

export default createMaintenanceRouter(new MaintenanceService(new PrismaMaintenanceRepository()));
