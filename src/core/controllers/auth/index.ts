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
router.get('/login-options', async (req, res) => {
  try {
    const isSpecializedApp = Boolean(req.query.app && req.query.app !== 'ALL');
    const entities = await prisma.entity.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        country: {
          select: { code: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const mapped = entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      code: entity.code,
      country: entity.country?.name || 'Tunisie',
      countryCode: entity.country?.code || 'TN',
    }));
    // Pour les logiciels métiers spécialisés (comptabilité, facturation, paie, etc.), filtrer strictement les entités tunisiennes
    const filtered = isSpecializedApp
      ? mapped.filter((e) => !e.code.includes('FR') && !e.code.includes('US') && !e.code.includes('AE') && !e.name.toLowerCase().includes('france') && !e.name.toLowerCase().includes('europe') && !e.name.toLowerCase().includes('usa') && !e.name.toLowerCase().includes('asie'))
      : mapped;
    res.json({ entities: filtered });
  } catch (error) {
    console.error('Erreur inattendue pendant le chargement des options de connexion.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(500).json({ error: 'Impossible de charger les entités de connexion.' });
  }
});
router.post('/login', createLoginHandler());

export default router;
