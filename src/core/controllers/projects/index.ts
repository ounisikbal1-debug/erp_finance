import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { PrismaProjectRepository } from '../../../application/modules/projects/repository';
import { ProjectService } from '../../../application/modules/projects/service';
import { ProjectRequestError } from '../../../application/modules/projects/validation';

function getUser(res: Response): AuthenticatedUser {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user) throw new ProjectRequestError('Authentification requise.', 401);
  return user;
}

function getScopedEntity(res: Response): string {
  return resolveEntityScope(getUser(res).entityId);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof ProjectRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le module projets:', error);
    res.status(500).json({ error: 'Impossible de traiter la demande projet.' });
  }
}

export function createProjectsRouter(service: ProjectService) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      res.json(await service.listProjects(getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/', async (req, res) => {
    try {
      res.status(201).json(await service.createProject(req.body, getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/:id/tasks', async (req, res) => {
    try {
      res.status(201).json(await service.createTask(req.params.id, req.body, getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      res.json(await service.updateProjectStatus(req.params.id, req.body?.status, getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.patch('/:id/tasks/:taskId/status', async (req, res) => {
    try {
      res.json(await service.updateTaskStatus(
        req.params.id,
        req.params.taskId,
        req.body?.status,
        getScopedEntity(res),
      ));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/:id/milestones', async (req, res) => {
    try {
      res.status(201).json(await service.createMilestone(req.params.id, req.body, getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.patch('/:id/milestones/:milestoneId/complete', async (req, res) => {
    try {
      res.json(await service.completeMilestone(
        req.params.id,
        req.params.milestoneId,
        getScopedEntity(res),
      ));
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/:id/costs', async (req, res) => {
    try {
      const user = getUser(res);
      res.status(201).json(await service.createCost(
        req.params.id,
        req.body,
        resolveEntityScope(user.entityId),
        user.id,
      ));
    } catch (error) {
      respondError(res, error);
    }
  });

  return router;
}

export default createProjectsRouter(new ProjectService(new PrismaProjectRepository()));
