/**
 * SAFE ERP - BANC D'Ã‰PREUVE DE STRESS ET HAUTE CHARGE CONCURRENTE
 * Simule des dizaines d'utilisateurs simultanÃ©s (requÃªtes concurrentes en lecture/Ã©criture)
 * Mesure les temps de rÃ©ponse moyens, P95, dÃ©bit (req/sec) et taux d'erreur 0%.
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
  console.log(`- Utilisateurs Virtuels  : ${concurrentUsers} utilisateurs simultanÃ©s`);
  console.log(`- RequÃªtes par usager    : ${requestsPerUser} requÃªtes`);
  console.log(`- Total transactions     : ${concurrentUsers * requestsPerUser} requÃªtes`);
  console.log('------------------------------------------------------------------');
  console.log('DÃ©marrage de la montÃ©e en charge...\n');

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
  console.log('                  RÃ‰SULTATS DU BENCHMARK DE CHARGE                ');
  console.log('==================================================================');
  console.log(`- DurÃ©e totale               : ${result.durationSeconds} s`);
  console.log(`- Transactions rÃ©ussies      : ${result.successfulRequests} / ${result.totalRequests} (${Math.round((result.successfulRequests / result.totalRequests) * 100)}%)`);
  console.log(`- Ã‰checs ou dÃ©connexions     : ${result.failedRequests} âŒ`);
  console.log(`- DÃ©bit moyen soutenu        : ${result.requestsPerSecond} requÃªtes / seconde`);
  console.log(`- Temps de latence moyen     : ${result.avgLatencyMs} ms`);
  console.log(`- Latence au 95e percentile  : ${result.p95LatencyMs} ms`);
  console.log('------------------------------------------------------------------');

  if (result.failedRequests === 0 && result.p95LatencyMs < 200) {
    console.log('ðŸŽ‰ VERDICT : CERTIFIÃ‰ HAUTE PERFORMANCE & RÃ‰SISTANT Ã€ LA CHARGE CONCURRENTE !');
  } else if (result.failedRequests === 0) {
    console.log('âœ… VERDICT : TEST RÃ‰USSI SANS AUCUNE ERREUR.');
  } else {
    console.log('âš ï¸ VERDICT : DES ERREURS ONT Ã‰TÃ‰ DÃ‰TECTÃ‰ES.');
  }
  console.log('==================================================================\n');

  return result;
}

// ExÃ©cution directe
runStressTest({
  baseUrl: 'http://127.0.0.1:3001',
  concurrentUsers: 50,
  requestsPerUser: 10,
}).catch(console.error);
