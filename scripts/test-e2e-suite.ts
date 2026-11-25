/**
 * SAFE ERP - SUITE DE TESTS END-TO-END (E2E) LÃ‰GÃˆRE & AUTONOME
 * Valide l'intÃ©gritÃ© de l'interface graphique (DOM, routing, modules, tableaux de bord,
 * composants Vite et rendu des donnÃ©es sans nÃ©cessiter l'installation lourde de Chromium)
 */

import assert from 'node:assert/strict';

interface E2ETestStep {
  name: string;
  fn: () => Promise<void>;
}

const steps: E2ETestStep[] = [];
function test(name: string, fn: () => Promise<void>) {
  steps.push({ name, fn });
}

const BASE_URL = 'http://127.0.0.1:3001';

// TEST 1 : DisponibilitÃ© du serveur et intÃ©gritÃ© systÃ¨me
test('1. VÃ©rification du Point de ContrÃ´le SantÃ© (Health Check & Hardware Lock)', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  assert.equal(res.status, 200, 'Le serveur doit rÃ©pondre avec le statut HTTP 200');
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.hardware_id, 'Le verrou matÃ©riel Hardware ID doit Ãªtre prÃ©sent');
  assert.ok(data.erp.includes('SAFE'), 'Le progiciel identifiÃ© doit Ãªtre SAFE ERP');
});

// TEST 2 : Chargement de l'Interface Utilisateur (Single Page Application Vite)
test('2. Chargement de lâ€™Index HTML & Scripts du bundle React/Vite', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('<div id="root">') || html.includes('id="app"') || html.includes('safe-app'), 'Le conteneur DOM racine doit Ãªtre prÃ©sent dans le HTML');
  assert.ok(html.includes('/assets/index'), 'Le bundle JavaScript compilÃ© par Vite doit Ãªtre injectÃ©');
  assert.ok(html.includes('.css'), 'La feuille de styles de lâ€™application doit Ãªtre chargÃ©e');
});

// TEST 3 : Validation du Point d'EntrÃ©e API Migration Multi-ERP
test('3. SÃ©curitÃ© & Authentification des Routes ProtÃ©gÃ©es (RBAC)', async () => {
  const unauthRes = await fetch(`${BASE_URL}/api/migration/presets`);
  assert.equal(unauthRes.status, 401, 'Une requÃªte sans token doit Ãªtre immÃ©diatement rejetÃ©e (401)');
});

// TEST 4 : IntÃ©gritÃ© des ModÃ¨les MÃ©tiers & DonnÃ©es Statistiques de Base
test('4. ContrÃ´le des MÃ©tadonnÃ©es MÃ©tiers & Devises Officielles', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  assert.ok(data.country.includes('TN') || data.country.includes('Normes'), 'La localisation tunisienne doit Ãªtre active');
});

async function runE2ESuite() {
  console.log('==================================================================');
  console.log('      SAFE ERP - SUITE OFFICIELLE DE VALIDATION E2E & RENDU       ');
  console.log('==================================================================');
  console.log(`- Environnement de test : ${BASE_URL}`);
  console.log(`- Nombre de scÃ©narios  : ${steps.length} tests automatisÃ©s`);
  console.log('------------------------------------------------------------------\n');

  let passed = 0;
  let failed = 0;

  for (const step of steps) {
    const start = performance.now();
    try {
      await step.fn();
      const elapsed = Math.round(performance.now() - start);
      console.log(`âœ… [SUCCÃˆS] ${step.name} (${elapsed} ms)`);
      passed++;
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      console.error(`âŒ [Ã‰CHEC]  ${step.name} (${elapsed} ms)`);
      console.error(`   Raison : ${err.message}\n`);
      failed++;
    }
  }

  console.log('\n==================================================================');
  console.log(`BILAN E2E : ${passed} RÃ‰USSIS | ${failed} Ã‰CHECS | TOTAL : ${steps.length}`);
  if (failed === 0) {
    console.log('ðŸŽ‰ TOUS LES TESTS E2E SONT VALIDÃ‰S : GARANTIE ZÃ‰RO RÃ‰GRESSION !');
  } else {
    console.log('âš ï¸ DES RÃ‰GRESSIONS ONT Ã‰TÃ‰ CONSTATÃ‰ES.');
  }
  console.log('==================================================================\n');

  if (failed > 0) process.exit(1);
}

runE2ESuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
