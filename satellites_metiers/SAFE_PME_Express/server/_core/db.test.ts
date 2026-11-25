import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDB } from "./db";

// db.ts åœ¨æ¨¡å—åŠ è½½æ—¶å°±æŒ‰ env.dbDriver å»º driverã€‚ä¸¤ä¸ª driver éƒ½ mock æŽ‰ï¼ŒäºŽæ˜¯è¿™ä¸ª
// æµ‹è¯•é—®çš„æ˜¯"atomic æŠŠè¯­å¥äº¤ç»™äº†è°"ï¼Œè€Œä¸æ˜¯"èƒ½ä¸èƒ½è¿žä¸Šåº“"ã€‚
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
  it("http: ä¸€ä¸ª batch â€”â€” ä¸€ä¸ª HTTP è¯·æ±‚é‡Œçš„æœåŠ¡ç«¯äº‹åŠ¡", async () => {
    const { atomic } = await loadWith("http");
    await atomic((() => ["q1", "q2"]) as never);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toEqual(["q1", "q2"]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("tcp: çœŸäº‹åŠ¡ï¼Œä¸” builder ç»‘åœ¨ tx ä¸Šè€Œä¸æ˜¯ db ä¸Š", async () => {
    const { atomic } = await loadWith("tcp");
    const seen: unknown[] = [];
    await atomic(((d: unknown) => {
      seen.push(d);
      return [Promise.resolve("r1")];
    }) as never);
    expect(transaction).toHaveBeenCalledTimes(1);
    // è¿™ä¸€æ¡æ˜¯è¿™ä¸ªæµ‹è¯•å­˜åœ¨çš„ç†ç”±ï¼šbuild æ”¶åˆ° db çš„è¯è¯­å¥å°±è·‘åœ¨äº‹åŠ¡å¤–é¢ï¼Œ
    // åå­—å« atomic è€Œè¡Œä¸ºä¸æ˜¯ â€”â€” æ¯”ç›´æŽ¥æŠ¥é”™æ›´ç³Ÿã€‚
    expect(seen[0]).toEqual({ tx: true });
    expect(batch).not.toHaveBeenCalled();
  });
});

// ç±»åž‹å±‚ç¦ä»¤ï¼Œä¸æ˜¯è¿è¡Œæ—¶æµ‹è¯•ï¼šè¿™ä¸ªå‡½æ•°ä½“ä»Žä¸ä¼šè¢«è°ƒç”¨ï¼ˆä¸‹é¢åª `void` å®ƒï¼Œä¸æ‰§è¡Œå®ƒï¼‰ï¼Œ
// çº¯ç²¹æ˜¯ç»™ tsc æ£€æŸ¥ç”¨çš„ã€‚ä¸€æ—¦ AppDB çš„ Omit æ¼æŽ‰ "transaction" æˆ– "batch" ä¸­çš„ä»»ä½•ä¸€ä¸ªï¼Œ
// å¯¹åº”é‚£è¡Œ @ts-expect-error å°±ä¼šå› ä¸º"æ²¡æœ‰é”™è¯¯å¯æŠ‘åˆ¶"è€ŒæŠ¥é”™ï¼Œpnpm typecheck å°±ä¼šå¤±è´¥â€”â€”
// è¿™æ˜¯é˜²æ­¢ `batch`ï¼ˆåªå­˜åœ¨äºŽ http é©±åŠ¨ï¼‰åœ¨å¦ä¸€ä¸ªæ–¹æ³•ä¸Šé‡æ¼” `transaction`
// ï¼ˆåªå­˜åœ¨äºŽ tcp é©±åŠ¨ï¼‰é‚£ç§ dev ç¼–è¯‘é€šè¿‡ã€prod è¿è¡Œæ—¶ TypeError çš„åˆ†è£‚ã€‚
function _typeOnlyBannedMethodsStayBanned(appDb: AppDB) {
  // @ts-expect-error transaction only exists on the tcp driver â€” banned from AppDB, see db.ts
  appDb.transaction;
  // @ts-expect-error batch only exists on the http driver â€” banned from AppDB, see db.ts
  appDb.batch;
}
void _typeOnlyBannedMethodsStayBanned;

// The pool is BOUNDED on purpose. On the platform each app has its own database
// on ONE shared Postgres cluster, so the ceiling that matters is (apps under
// active iteration x max) â€” node-postgres' default of 10 is sized for an app
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
