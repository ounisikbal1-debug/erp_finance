/**
 * SAFE ERP - Contrôleur de Migration Universelle Multi-ERP
 * Expose les endpoints REST pour l'analyse, la simulation (dry-run)
 * et l'exécution transactionnelle de migration depuis SAP, Oracle, Sage, etc.
 */

import express, { Request, Response } from 'express';
import {
  ERP_PRESETS,
  TARGET_DOMAIN_FIELDS,
  detectDelimiter,
  parseDelimitedText,
  detectErpSystem,
  buildFieldMappings,
  simulateMigration,
  executeMigration,
  type MigrationSourceERP,
  type MigrationTargetDomain,
} from '../../services/migration/universal-migration.service';
import { prisma } from '../../services/migration/universal-migration.service';

const router = express.Router();

// 1. Lister les configurations, presets et champs cibles disponibles
router.get('/presets', (_req: Request, res: Response) => {
  res.json({
    success: true,
    presets: ERP_PRESETS,
    targetDomains: TARGET_DOMAIN_FIELDS,
    availableDomains: Object.keys(TARGET_DOMAIN_FIELDS),
    availableErps: Object.keys(ERP_PRESETS),
  });
});

// 2. Analyser un fichier source (CSV, TSV, JSON)
router.post('/analyze', (req: Request, res: Response) => {
  try {
    const { content, targetDomain, sourceErp, delimiter } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'Le contenu du fichier source est requis (texte brut CSV/TSV/JSON).' });
      return;
    }

    if (!targetDomain || !TARGET_DOMAIN_FIELDS[targetDomain as MigrationTargetDomain]) {
      res.status(400).json({
        success: false,
        error: `Domaine cible invalide. Domaines acceptés : ${Object.keys(TARGET_DOMAIN_FIELDS).join(', ')}`,
      });
      return;
    }

    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];
    const trimmed = content.trim();

    // Détection JSON ou délimité
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsedJson = JSON.parse(trimmed);
      if (!Array.isArray(parsedJson) || parsedJson.length === 0) {
        res.status(400).json({ success: false, error: 'Le JSON doit être un tableau non vide d’objets.' });
        return;
      }
      headers = Object.keys(parsedJson[0]);
      rows = parsedJson;
    } else {
      const detectedDelim = delimiter || detectDelimiter(content);
      const parsedRows = parseDelimitedText(content, detectedDelim);
      if (parsedRows.length < 2) {
        res.status(400).json({ success: false, error: 'Le fichier délimité doit contenir au moins une ligne d’en-tête et une ligne de données.' });
        return;
      }
      headers = parsedRows[0];
      const dataRows = parsedRows.slice(1);
      rows = dataRows.map((r) => {
        const rowObj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = r[idx] !== undefined ? r[idx] : '';
        });
        return rowObj;
      });
    }

    const detectedErp: MigrationSourceERP = sourceErp || detectErpSystem(headers);
    const mappingProposals = buildFieldMappings(headers, targetDomain as MigrationTargetDomain, detectedErp);

    res.json({
      success: true,
      detectedErp,
      totalRows: rows.length,
      headers,
      mappingProposals,
      previewSample: rows.slice(0, 5),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: `Erreur lors de l’analyse : ${error.message}` });
  }
});

// 3. Simuler la migration (Simulation / Dry Run sans écriture en base)
router.post('/simulate', (req: Request, res: Response) => {
  try {
    const { rows, targetDomain, fieldMapping, sourceErp } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, error: 'Les lignes de données sont requises pour la simulation.' });
      return;
    }

    if (!targetDomain || !TARGET_DOMAIN_FIELDS[targetDomain as MigrationTargetDomain]) {
      res.status(400).json({ success: false, error: 'Domaine cible invalide.' });
      return;
    }

    if (!fieldMapping || typeof fieldMapping !== 'object') {
      res.status(400).json({ success: false, error: 'Le dictionnaire de correspondance des champs est requis.' });
      return;
    }

    const simulation = simulateMigration(
      rows,
      targetDomain as MigrationTargetDomain,
      fieldMapping,
      sourceErp || 'GENERIC'
    );

    res.json({
      success: true,
      simulation,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: `Erreur lors de la simulation : ${error.message}` });
  }
});

// 4. Exécuter l'importation réelle dans la base SAFE
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { entityId, targetDomain, rows, fieldMapping, options } = req.body;

    if (!entityId || typeof entityId !== 'string') {
      res.status(400).json({ success: false, error: 'L’identifiant d’entité (entityId) est requis pour la migration.' });
      return;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, error: 'Aucune donnée à importer.' });
      return;
    }

    if (!targetDomain || !TARGET_DOMAIN_FIELDS[targetDomain as MigrationTargetDomain]) {
      res.status(400).json({ success: false, error: 'Domaine cible invalide.' });
      return;
    }

    if (!fieldMapping || typeof fieldMapping !== 'object') {
      res.status(400).json({ success: false, error: 'Le dictionnaire de correspondance des champs est requis.' });
      return;
    }

    const actorUserId = (req as any).user?.id || 'SYSTEM_MIGRATION';

    const result = await executeMigration(
      entityId,
      targetDomain as MigrationTargetDomain,
      rows,
      fieldMapping,
      options || { updateExisting: true, skipErrors: true },
      actorUserId
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: `Échec de l’exécution de la migration : ${error.message}` });
  }
});

// 5. Historique des migrations
router.get('/history/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;
    // utilise le singleton prisma importé en tête de fichier

    const events = await prisma.adminUserEvent.findMany({
      where: {
        entityId,
        action: { startsWith: 'ERP_MIGRATION_' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      success: true,
      history: events.map((e: any) => ({
        id: e.id,
        action: e.action,
        actorUsername: e.actorUsername,
        date: e.createdAt,
        details: e.details ? JSON.parse(e.details) : null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: `Erreur lors de la récupération de l’historique : ${error.message}` });
  }
});

export default router;
