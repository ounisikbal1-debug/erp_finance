// Platform-mediated LLM access (DESIGN Â§5.1.2 / Â§8.5).
//
// Routed through the platform so usage is metered to the owner's account and
// rate-limited per app â€” a public app calling an LLM on every anonymous request
// would otherwise burn the platform's keys without bound. App code never holds
// a raw provider key.
//
// M1 ships the SIGNATURE; the platform LLM endpoint (â†’ core/services/llm.py)
// is wired in a later milestone (Â§8.5).
export interface LlmInput {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export async function complete(_input: LlmInput): Promise<string> {
  throw new Error("llm.complete: platform LLM endpoint not wired yet (DESIGN Â§8.5).");
}
