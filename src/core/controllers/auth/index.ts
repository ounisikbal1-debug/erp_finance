import { Router } from 'express';
import { authenticate, revokeAccessSession } from '../../../application/auth';
import prisma from '../../models/prisma';
import { createEntityContextHandlers } from './entity-context-handler';
import { createLoginHandler } from './login-handler';

const router = Router();
const entityContextHandlers = createEntityContextHandlers();

router.post('/activity', authenticate, (_req, res) => {
  res.sendStatus(204);
});

router.post('/logout', authenticate, async (_req, res) => {
  const sessionId = res.locals.authenticatedSessionId as string | undefined;
  if (!sessionId) {
    res.status(500).json({ error: 'Impossible d’identifier la session à fermer.' });
    return;
  }
  try {
    await revokeAccessSession(sessionId);
    res.sendStatus(204);
  } catch (error) {
    console.error('Erreur inattendue pendant la fermeture de session.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(503).json({ error: 'La session n’a pas pu être révoquée. Réessayez.' });
  }
});

router.get('/entities', authenticate, entityContextHandlers.list);
router.post('/entity-context', authenticate, entityContextHandlers.select);
router.get('/login-options', async (_req, res) => {
  try {
    const entities = await prisma.entity.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    res.json({ entities });
  } catch (error) {
    console.error('Erreur inattendue pendant le chargement des options de connexion.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(500).json({ error: 'Impossible de charger les entités de connexion.' });
  }
});
router.post('/login', createLoginHandler());

export default router;
