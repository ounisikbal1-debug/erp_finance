import express, { type RequestHandler } from 'express';
import { authenticate, authenticateBusinessIntelligence, authorize, getAuthSecret, getModuleRoles, type UserRole } from './auth';
import authRouter from './modules/auth/api';
import financeRouter from './modules/finance/api';
import monthlyCloseRouter from './modules/monthly-close/api';
import budgetRouter from './modules/budget/api';
import cashflowRouter from './modules/cashflow/api';
import consolidationRouter from './modules/consolidation/api';
import intercompanyRouter from './modules/intercompany/api';
import advancedFinanceRouter from './modules/advanced-finance/api';
import dashboardRouter from './modules/dashboard/api';
import taxationRouter from './modules/taxation/api';
import controllingRouter from './modules/controlling/api';
import anomaliesRouter from './modules/anomalies/api';
import materialsRouter from './modules/materials/api';
import productionRouter from './modules/production/api';
import salesRouter from './modules/sales/api';
import maintenanceRouter from './modules/maintenance/api';
import projectsRouter from './modules/projects/api';
import tendersRouter from './modules/tenders/api';
import customsRegimeRouter from './modules/customs/regime-api';
import qualityRouter from './modules/quality/api';
import hrRouter from './modules/hr/api';
import adminRouter from './modules/admin/api';
import purchasesRouter from './modules/purchases/api';
import fxRatesRouter from './modules/fx/api';
import { startDailyFxReversalProcessing } from './modules/fx/revaluation-scheduler';
import receivablesRouter from './modules/receivables/api';
import { startDailyBctRateImport } from './modules/fx/scheduler';
import biRouter from './modules/bi/api';
import aiRouter from './modules/ai/api';
import { checkSystemLicense, saveSystemLicense, getHardwareId } from './hardwareLicense';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Healthcheck & Hardware ID
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  erp: 'SAFE - Système d’Analyse Financière des Entreprises',
  version: '2.0',
  country: 'TN (Normes Tunisiennes & Multi-Pays)',
  hardware_id: getHardwareId(),
  date: new Date().toISOString()
}));

// Endpoints de Gestion de Licence Matérielle HMAC-SHA256
app.get('/api/license/status', (req, res) => {
  const moduleCode = (req.query.module as string) || undefined;
  const status = checkSystemLicense(moduleCode);
  res.json({
    activated: status.activated,
    hardware_id: status.hardwareId,
    info: status.info,
    license_key: status.licenseKey,
    devise: 'TND',
    norme: 'Système Comptable des Entreprises (SCE NC 01)',
    taux_tva: ['19%', '13%', '7%'],
    timbre_fiscal: '1.000 TND',
    retenues_source: ['1.5%', '10%']
  });
});

app.post('/api/license/activate', (req, res) => {
  const { license_key, module_code } = req.body || {};
  if (!license_key || typeof license_key !== 'string') {
    return res.status(400).json({ detail: 'Clé de licence obligatoire' });
  }
  const result = saveSystemLicense(license_key, module_code);
  if (!result.success) {
    return res.status(400).json({ detail: result.message });
  }
  return res.json({ success: true, message: result.message });
});

app.use('/api/auth', authRouter);

function mountProtectedRouter(
  path: string,
  router: express.Router,
  roles: readonly UserRole[],
  authentication: RequestHandler = authenticate,
) {
  app.use(path, authentication, authorize(...roles), router);
}

// Routes avec préfixe /api
const moduleRouters: Record<string, express.Router> = {
  dashboard: dashboardRouter,
  bi: biRouter,
  ai: aiRouter,
  finance: financeRouter,
  'monthly-close': monthlyCloseRouter,
  budget: budgetRouter,
  cashflow: cashflowRouter,
  consolidation: consolidationRouter,
  intercompany: intercompanyRouter,
  'advanced-finance': advancedFinanceRouter,
  taxation: taxationRouter,
  controlling: controllingRouter,
  anomalies: anomaliesRouter,
  materials: materialsRouter,
  production: productionRouter,
  maintenance: maintenanceRouter,
  projects: projectsRouter,
  tenders: tendersRouter,
  'customs-regimes': customsRegimeRouter,
  quality: qualityRouter,
  purchases: purchasesRouter,
  'fx-rates': fxRatesRouter,
  sales: salesRouter,
  receivables: receivablesRouter,
  hr: hrRouter,
  admin: adminRouter,
};

for (const [name, router] of Object.entries(moduleRouters)) {
  const roles = getModuleRoles(name);
  if (!roles) throw new Error(`Politique d’accès manquante pour le module ${name}`);
  const authentication = name === 'bi' ? authenticateBusinessIntelligence : authenticate;
  mountProtectedRouter(`/api/${name}`, router, roles, authentication);

  // Compatibilité des anciens chemins ; les mêmes contrôles s’appliquent.
  mountProtectedRouter(`/${name}`, router, roles, authentication);
}

// Service de l'Interface Web SAFE ERP (Statique & SPA)
const fs = require('node:fs');
const path = require('path');
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));

// Toutes les requêtes Web non-API renvoient l'interface SAFE ERP
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  next();
});

if (require.main === module || process.env.SAFE_ERP_PRODUCTION_START === '1') {
  delete process.env.SAFE_ERP_PRODUCTION_START;
  const isProduction = process.env.NODE_ENV === 'production';
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  const HOST = process.env.API_HOST ?? '127.0.0.1';
  if (!Number.isInteger(PORT) || PORT < (isProduction ? 1 : 0) || PORT > 65535) {
    throw new Error('PORT doit être un port TCP compris entre 0 et 65535');
  }
  if (!getAuthSecret()) {
    throw new Error('Configurez SAFE_ERP_AUTH_SECRET avec au moins 32 octets avant de démarrer SAFE ERP.');
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(HOST)) {
    throw new Error('SAFE ERP refuse toute écoute HTTP directe sur le réseau; utilisez un reverse proxy HTTPS vers une adresse locale.');
  }
  if (isProduction && process.env.SAFE_ERP_DATABASE_PROVIDER !== 'postgresql') {
    throw new Error('La production exige SAFE_ERP_DATABASE_PROVIDER=postgresql.');
  }
  if (isProduction && !fs.existsSync(path.join(distPath, 'index.html'))) {
    throw new Error('Interface de production absente. Exécutez npm run build:production avant le démarrage.');
  }
  if (isProduction) process.env.SAFE_ERP_PERSISTENT_SESSIONS = 'true';

  if (process.env.SAFE_ERP_FX_DAILY_IMPORT_ENABLED === 'true') {
    startDailyBctRateImport();
  }
  startDailyFxReversalProcessing();

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Serveur SAFE_ERP lancé sur http://${HOST}:${PORT}`);
    console.log(`💼 Interface Web accessible sur http://localhost:${PORT} et http://localhost:5176`);
    console.log(`🇹🇳 Localisation par défaut : Tunisie (SCE, TVA 19/13/7%, IRPP 8 tranches, CNSS 9.68%)`);
  });
}

export default app;
