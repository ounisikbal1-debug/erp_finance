import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// env.ts 在导入时就 required() äº†ä¸€æ‰¹å˜é‡,æ‰€ä»¥æ¯ä¸ªç”¨ä¾‹å‰æŠŠå®ƒä»¬è¡¥é½,
// å†ç”¨ vi.resetModules 拿一份新的。
const PLATFORM = {
  DATABASE_URL: "postgresql://u:p@h/db",
  JWT_SECRET: "j",
  APP_SLUG: "demo",
};

async function loadEnv() {
  const mod = await import("./env");
  return mod.env;
}

describe("user-supplied configuration and secrets", () => {
  beforeEach(() => {
    Object.assign(process.env, PLATFORM);
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.SUPPORT_EMAIL;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("returns a configured value", async () => {
    process.env.SUPPORT_EMAIL = "help@example.com";
    const env = await loadEnv();
    expect(env.config("SUPPORT_EMAIL")).toBe("help@example.com");
  });

  it("falls back when a config is absent", async () => {
    const env = await loadEnv();
    expect(env.config("SUPPORT_EMAIL", "default@example.com"))
      .toBe("default@example.com");
  });

  it("treats an empty-string config the same as absent — falls back when given one", async () => {
    process.env.SUPPORT_EMAIL = "";
    const env = await loadEnv();
    expect(env.config("SUPPORT_EMAIL", "default@example.com"))
      .toBe("default@example.com");
  });

  it("treats an empty-string config the same as absent — throws with no fallback", async () => {
    process.env.SUPPORT_EMAIL = "";
    const env = await loadEnv();
    expect(() => env.config("SUPPORT_EMAIL")).toThrow(/SUPPORT_EMAIL/);
  });

  it("throws for a missing config with no fallback, naming where to set it", async () => {
    const env = await loadEnv();
    // æŠ¥é”™æ˜¯æ•´æ¡é“¾è·¯çš„æœ€åŽä¸€çŽ¯,也是用户唯一会看到的那一环 —— agent è¯»ä¸åˆ°
    // å€¼ä¹Ÿå¡«ä¸äº†å€¼,æ‰€ä»¥è¿™å¥è¯å¿…é¡»è¯´æ¸…æ¥šåŽ»å“ªå¡«ã€‚
    expect(() => env.config("SUPPORT_EMAIL")).toThrow(/Web Admin → Secrets/);
    expect(() => env.config("SUPPORT_EMAIL")).toThrow(/SUPPORT_EMAIL/);
  });

  it("throws for a missing secret — no fallback parameter exists", async () => {
    const env = await loadEnv();
    expect(() => env.secret("STRIPE_SECRET_KEY")).toThrow(/Web Admin → Secrets/);
  });

  it("names the SCOPE the value is missing from, dev and prod alike", async () => {
    // dev 和 prod å¯¹åŒä¸€ä¸ª key 存的是两份值,æ‰€ä»¥åªè¯´ã€ŒåŽ»è®¾ç½®é‡Œå¡«ã€ä¼šæŠŠç”¨æˆ·
    // æŒ‡å‘ä»–å·²ç»å¡«è¿‡çš„é‚£ä¸€åˆ—ã€‚spec §7.1 çš„ä¾‹å­å°±å¸¦ç€ (prod)。
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      vi.resetModules();
      const prodEnv = await loadEnv();
      expect(() => prodEnv.secret("STRIPE_SECRET_KEY")).toThrow(/\(prod\)/);
      expect(() => prodEnv.secret("STRIPE_SECRET_KEY")).toThrow(/Apply to production/);

      process.env.NODE_ENV = "development";
      vi.resetModules();
      const devEnv = await loadEnv();
      expect(() => devEnv.secret("STRIPE_SECRET_KEY")).toThrow(/\(dev\)/);
      expect(() => devEnv.secret("STRIPE_SECRET_KEY")).not.toThrow(/Apply to production/);
      expect(() => devEnv.config("SUPPORT_EMAIL")).toThrow(/\(dev\)/);
    } finally {
      // NODE_ENV 决定 isProd,而 isProd æ˜¯æ¨¡å—çº§å¸¸é‡ —— æ¼è¿˜åŽŸä¼šè®©è¿™ä¸ªæ–‡ä»¶
      // åŽé¢æ¯ä¸€æ¡ç”¨ä¾‹éƒ½è·‘åœ¨ä¸€ä¸ªå®ƒæ²¡é€‰è¿‡çš„çŽ¯å¢ƒé‡Œã€‚
      process.env.NODE_ENV = savedNodeEnv;
      vi.resetModules();
    }
  });

  it("refuses to read a platform variable through the user accessors", async () => {
    const env = await loadEnv();
    expect(() => env.config("DATABASE_URL")).toThrow(/platform/i);
    expect(() => env.secret("JWT_SECRET")).toThrow(/platform/i);
  });
});

describe("dotenv precedence (the ground this design stands on)", () => {
  it("lets a later line win over an earlier one for the same key", async () => {
    // å¹³å°å˜é‡æŽ’åœ¨ .env çš„æœ€åŽå°±æ°¸è¿œèµ¢ —— å³ä½¿å†™å…¥å±‚çš„ä¿ç•™åå•æ¼äº†ä¸€ä¸ª,
    // ç”¨æˆ·ä¹Ÿè¦†ç›–ä¸æŽ‰ DATABASE_URLã€‚ä¾èµ–é’‰åœ¨ dotenv 17.4.2;bump çš„äººä¸è¯¥
    // é è¯»è®¾è®¡æ–‡æ¡£æ‰çŸ¥é“ä¸èƒ½ç¢°è¿™ä¸ªè¡Œä¸ºã€‚
    const dotenv = await import("dotenv");
    const parsed = dotenv.parse("K=first\nK=second\n");
    expect(parsed.K).toBe("second");
  });
});

// åŒä¸€å—è·¯æ ‡,给 bump ä¾èµ–çš„äººçœ‹çš„ç¬¬äºŒæ¡:å¹³å°å†™ .env 的那三处
// (scaffold.build_env_file / deploy_provider 的两处)ç”¨çš„æ˜¯ä¸‹é¢è¿™å¥—å¼•å·è§„åˆ™ã€‚
// å®ƒä¸æ˜¯é£Žæ ¼,是正确性 —— æœªåŠ å¼•å·æ—¶ dotenv 在第一个 # 处截断值,ä¸€ä¸ªå¯†ç 
// 带 # 的第三方 key 会在预览和 DaytonaPark ç”Ÿäº§ä¸Šæ‚„æ‚„å˜çŸ­,而 Cloud Run 走
// çš„æ˜¯çœŸçŽ¯å¢ƒå˜é‡ã€æ‹¿åˆ°çš„æ˜¯å®Œæ•´å€¼ã€‚åŒä¸€ä¸ªå¯†é’¥ä¸¤ä¸ªå€¼,没有任何报错。
//
// 规则(与 backend/core/webapp_builder/scaffold.py::quote_env_value 一致):
// 值里没有 ' → 用 ';å¦åˆ™æ²¡æœ‰ ` → 用 `;å¦åˆ™æ²¡æœ‰ " 也没有 \ → 用 "。
// éƒ½ä¸æ»¡è¶³åˆ™é‚£ä¸ªå€¼æ ¹æœ¬æ²¡æ³•å†™è¿› .env,写入层直接拒。
function quoteEnvValue(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes("`")) return "`" + value + "`";
  if (!value.includes('"') && !value.includes("\\")) return `"${value}"`;
  throw new Error("unquotable");
}

describe("dotenv value fidelity (what the platform writes is what the app reads)", () => {
  const cases = [
    "abc#def",                      // è¿™ä¸€æ¡æ˜¯å…¨éƒ¨ç†ç”±:è£¸å†™ä¼šè¢«æˆªæˆ "abc"
    "postgres://user:p#ss@host/db", // å¹³å°è‡ªå·±çš„ DSN ä¹Ÿèµ°åŒä¸€æ¡çº¿
    "plain",
    "with space",
    "#leading",
    "trailing#",
    'has"double',
    "has'single",
    "has`backtick",
    "back\\slash",                  // åŒå¼•å·é‡Œ \n ä¼šè¢«åè½¬ä¹‰,æ‰€ä»¥ä¸èƒ½ç”¨åŒå¼•å·
    "C:\\new",
    "a'b`c",
    "$dollar{brace}",
    "",
  ];

  it.each(cases)("round-trips %j through dotenv unchanged", async (value) => {
    const dotenv = await import("dotenv");
    // åŽé¢è·Ÿä¸€è¡Œå“¨å…µ:è¢«æˆªæ–­çš„å€¼ä¼šæŠŠå‰©ä¸‹çš„åŠè¡Œå½“æ³¨é‡ŠåƒæŽ‰,åªæ–­è¨€ K çœ‹ä¸å‡ºæ¥ã€‚
    const parsed = dotenv.parse(`K=${quoteEnvValue(value)}\nNEXT=sentinel\n`);
    expect(parsed.K).toBe(value);
    expect(parsed.NEXT).toBe("sentinel");
  });

  it("shows what the bare form this replaced actually did", async () => {
    // å›žå½’çš„è¯æ®æœ¬èº«ã€‚æœ‰äººæŠŠå¼•å·æ‹¿æŽ‰æ—¶,ä¸Šé¢é‚£ç»„ä¼šçº¢,è¿™ä¸€æ¡ä¼šç»¿ —— 两边
    // åˆèµ·æ¥è¯´æ˜Žç™½äº†ã€Œä¸ºä»€ä¹ˆå½“åˆè¦åŠ å¼•å·ã€ã€‚
    const dotenv = await import("dotenv");
    expect(dotenv.parse("K=abc#def\n").K).toBe("abc");
    expect(dotenv.parse('K="quoted"\n').K).toBe("quoted");
  });
});
