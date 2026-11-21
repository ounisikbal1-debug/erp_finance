import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'node:test';

type WorkerEvent = {
  request?: Request;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
};

async function createWorkerHarness(fetchImplementation: typeof fetch) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const cacheEntries = new Map<string, Response>();
  const cache = {
    add: async (url: string) => { cacheEntries.set(url, new Response('cached shell')); },
    put: async (request: Request | string, response: Response) => {
      cacheEntries.set(typeof request === 'string' ? request : request.url, response);
    },
  };
  const self = {
    location: { origin: 'https://safe.example' },
    clients: { claim: async () => undefined },
    addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
    skipWaiting: async () => undefined,
  };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
    match: async (request: Request | string) => cacheEntries.get(
      typeof request === 'string' ? request : request.url,
    ),
  };
  const source = await readFile('public/safe-service-worker.js', 'utf8');
  runInNewContext(source, { self, caches, fetch: fetchImplementation, URL, Promise, Error });
  return { handlers, cacheEntries };
}

describe('installable app service worker', () => {
  it('does not intercept API requests and only caches static assets', async () => {
    let fetchCount = 0;
    const harness = await createWorkerHarness(async () => {
      fetchCount += 1;
      return new Response('static');
    });

    let apiResponse: Promise<Response> | undefined;
    harness.handlers.get('fetch')?.({
      request: new Request('https://safe.example/api/sales/quotes'),
      respondWith: (response) => { apiResponse = response; },
    });
    assert.equal(apiResponse, undefined);
    assert.equal(fetchCount, 0);

    let assetResponse: Promise<Response> | undefined;
    harness.handlers.get('fetch')?.({
      request: new Request('https://safe.example/assets/app.js'),
      respondWith: (response) => { assetResponse = response; },
    });
    assert.equal(await (await assetResponse)?.text(), 'static');
    assert.equal(harness.cacheEntries.has('https://safe.example/assets/app.js'), true);
  });

  it('serves the cached app shell for offline navigation', async () => {
    const harness = await createWorkerHarness(async () => {
      throw new TypeError('offline');
    });
    harness.cacheEntries.set('/', new Response('cached shell'));
    let navigationResponse: Promise<Response> | undefined;
    harness.handlers.get('fetch')?.({
      request: {
        method: 'GET',
        url: 'https://safe.example/',
        mode: 'navigate',
      } as Request,
      respondWith: (response) => { navigationResponse = response; },
    });
    assert.equal(await (await navigationResponse)?.text(), 'cached shell');
  });
});
