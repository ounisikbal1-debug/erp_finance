import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDB } from "./db";

// db.ts åœ¨æ¨¡å—åŠ è½½æ—¶å°±æŒ‰ env.dbDriver 建 driver。两个 driver 都 mock 掉，于是这个
// 测试问的是"atomic æŠŠè¯­å¥äº¤ç»™äº†è°"ï¼Œè€Œä¸æ˜¯"èƒ½ä¸èƒ½è¿žä¸Šåº“"。
const batch = vi.fn(async (qs: unknown[]) => qs.map(() => []));
const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ tx: true }));

vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ batch }) }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => ({ transaction }) }));
const poolConfigs: Record<string, unknown>[] = [];
vi.mock("pg", () => ({
  default: {
    Pool: class {
      constructor(config: Record<string, unknown>) {
        poolConfigs.push(config);
      }
      on() {}
    },
  },
}));

async function loadWith(driver: "http" | "tcp", dbPoolMax = 5) {
  vi.resetModules();
  poolConfigs.length = 0;
  vi.doMock("./env", () => ({
    env: { dbDriver: driver, databaseUrl: "postgres://x", dbPoolMax },
  }));
  return await import("./db");
}

beforeEach(() => {
  batch.mockClear();
  transaction.mockClear();
});

describe("atomic", () => {
  it("http: 一个 batch —— 一个 HTTP è¯·æ±‚é‡Œçš„æœåŠ¡ç«¯äº‹åŠ¡", async () => {
    const { atomic } = await loadWith("http");
    await atomic((() => ["q1", "q2"]) as never);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toEqual(["q1", "q2"]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("tcp: 真事务，且 builder 绑在 tx ä¸Šè€Œä¸æ˜¯ db 上", async () => {
    const { atomic } = await loadWith("tcp");
    const seen: unknown[] = [];
    await atomic(((d: unknown) => {
      seen.push(d);
      return [Promise.resolve("r1")];
    }) as never);
    expect(transaction).toHaveBeenCalledTimes(1);
    // è¿™ä¸€æ¡æ˜¯è¿™ä¸ªæµ‹è¯•å­˜åœ¨çš„ç†ç”±ï¼šbuild 收到 db çš„è¯è¯­å¥å°±è·‘åœ¨äº‹åŠ¡å¤–é¢ï¼Œ
    // åå­—å« atomic è€Œè¡Œä¸ºä¸æ˜¯ —— 比直接报错更糟。
    expect(seen[0]).toEqual({ tx: true });
    expect(batch).not.toHaveBeenCalled();
  });
});

// ç±»åž‹å±‚ç¦ä»¤ï¼Œä¸æ˜¯è¿è¡Œæ—¶æµ‹è¯•ï¼šè¿™ä¸ªå‡½æ•°ä½“ä»Žä¸ä¼šè¢«è°ƒç”¨ï¼ˆä¸‹é¢åª `void` å®ƒï¼Œä¸æ‰§è¡Œå®ƒï¼‰ï¼Œ
// 纯粹是给 tsc 检查用的。一旦 AppDB 的 Omit æ¼æŽ‰ "transaction" 或 "batch" 中的任何一个，
// 对应那行 @ts-expect-error 就会因为"æ²¡æœ‰é”™è¯¯å¯æŠ‘åˆ¶"而报错，pnpm typecheck 就会失败——
// 这是防止 `batch`ï¼ˆåªå­˜åœ¨äºŽ http é©±åŠ¨ï¼‰åœ¨å¦ä¸€ä¸ªæ–¹æ³•ä¸Šé‡æ¼” `transaction`
// ï¼ˆåªå­˜åœ¨äºŽ tcp é©±åŠ¨ï¼‰é‚£ç§ dev ç¼–è¯‘é€šè¿‡ã€prod è¿è¡Œæ—¶ TypeError 的分裂。
function _typeOnlyBannedMethodsStayBanned(appDb: AppDB) {
  // @ts-expect-error transaction only exists on the tcp driver — banned from AppDB, see db.ts
  appDb.transaction;
  // @ts-expect-error batch only exists on the http driver — banned from AppDB, see db.ts
  appDb.batch;
}
void _typeOnlyBannedMethodsStayBanned;

// The pool is BOUNDED on purpose. On the platform each app has its own database
// on ONE shared Postgres cluster, so the ceiling that matters is (apps under
// active iteration x max) — node-postgres' default of 10 is sized for an app
// that owns its server, and a handful of them exhausts the cluster's slots.
describe("tcp pool", () => {
  it("caps connections at env.dbPoolMax", async () => {
    await loadWith("tcp", 3);
    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0].max).toBe(3);
    expect(poolConfigs[0].connectionString).toBe("postgres://x");
  });

  it("opens no pool at all on http", async () => {
    await loadWith("http");
    expect(poolConfigs).toHaveLength(0);
  });
});
