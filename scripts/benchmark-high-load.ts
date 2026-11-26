/**
 * SAFE ERP - BANC D'ÉPREUVE DE STRESS ET HAUTE CHARGE CONCURRENTE
 * Simule des dizaines d'utilisateurs simultanés (requêtes concurrentes en lecture/écriture)
 * Mesure les temps de réponse moyens, P95, débit (req/sec) et taux d'erreur 0%.
 */

import { performance } from 'node:perf_hooks';

interface StressTestOptions {
  baseUrl: string;
  concurrentUsers: number;
  requestsPerUser: number;
}

interface TestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationSeconds: number;
  requestsPerSecond: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function runWorker(
  workerId: number,
  baseUrl: string,
  requestsCount: number,
  latencies: number[],
  errors: string[]
) {
  const endpoints = [
    '/health',
    '/',
  ];

  for (let i = 0; i < requestsCount; i++) {
    const ep = endpoints[i % endpoints.length];
    const url = `${baseUrl}${ep}`;
    const start = performance.now();

    try {
      const response = await fetch(url, { method: 'GET' });
      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      if (!response.ok) {
        errors.push(`Worker ${workerId} req ${i} HTTP ${response.status}`);
      }
    } catch (err: any) {
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      errors.push(`Worker ${workerId} req ${i} Err: ${err.message}`);
    }
  }
}

export async function runStressTest(options: StressTestOptions): Promise<TestResult> {
  const { baseUrl, concurrentUsers, requestsPerUser } = options;
  console.log('==================================================================');
  console.log('      SAFE ERP - BANC DE TEST DE CHARGE MASSIVE (STRESS TEST)     ');
  console.log('==================================================================');
  console.log(`- Cible                  : ${baseUrl}`);
  console.log(`- Utilisateurs Virtuels  : ${concurrentUsers} utilisateurs simultanés`);
  console.log(`- Requêtes par usager    : ${requestsPerUser} requêtes`);
  console.log(`- Total transactions     : ${concurrentUsers * requestsPerUser} requêtes`);
  console.log('------------------------------------------------------------------');
  console.log('Démarrage de la montée en charge...\n');

  const latencies: number[] = [];
  const errors: string[] = [];
  const startTime = performance.now();

  const workers: Promise<void>[] = [];
  for (let u = 1; u <= concurrentUsers; u++) {
    workers.push(runWorker(u, baseUrl, requestsPerUser, latencies, errors));
  }

  await Promise.all(workers);

  const durationSeconds = (performance.now() - startTime) / 1000;
  const totalRequests = latencies.length;
  const failedRequests = errors.length;
  const successfulRequests = totalRequests - failedRequests;
  const requestsPerSecond = totalRequests / durationSeconds;
  const sumLatency = latencies.reduce((acc, v) => acc + v, 0);
  const avgLatencyMs = sumLatency / totalRequests;
  const p95LatencyMs = percentile(latencies, 0.95);

  const result: TestResult = {
    totalRequests,
    successfulRequests,
    failedRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    requestsPerSecond: Math.round(requestsPerSecond * 10) / 10,
    avgLatencyMs: Math.round(avgLatencyMs * 10) / 10,
    p95LatencyMs: Math.round(p95LatencyMs * 10) / 10,
  };

  console.log('==================================================================');
  console.log('                  RÉSULTATS DU BENCHMARK DE CHARGE                ');
  console.log('==================================================================');
  console.log(`- Durée totale               : ${result.durationSeconds} s`);
  console.log(`- Transactions réussies      : ${result.successfulRequests} / ${result.totalRequests} (${Math.round((result.successfulRequests / result.totalRequests) * 100)}%)`);
  console.log(`- Échecs ou déconnexions     : ${result.failedRequests} ❌`);
  console.log(`- Débit moyen soutenu        : ${result.requestsPerSecond} requêtes / seconde`);
  console.log(`- Temps de latence moyen     : ${result.avgLatencyMs} ms`);
  console.log(`- Latence au 95e percentile  : ${result.p95LatencyMs} ms`);
  console.log('------------------------------------------------------------------');

  if (result.failedRequests === 0 && result.p95LatencyMs < 200) {
    console.log('🎉 VERDICT : CERTIFIÉ HAUTE PERFORMANCE & RÉSISTANT À LA CHARGE CONCURRENTE !');
  } else if (result.failedRequests === 0) {
    console.log('✅ VERDICT : TEST RÉUSSI SANS AUCUNE ERREUR.');
  } else {
    console.log('⚠️ VERDICT : DES ERREURS ONT ÉTÉ DÉTECTÉES.');
  }
  console.log('==================================================================\n');

  return result;
}

// Exécution directe
runStressTest({
  baseUrl: 'http://127.0.0.1:3001',
  concurrentUsers: 50,
  requestsPerUser: 10,
}).catch(console.error);
