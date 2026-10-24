import { ProviderError, QuotaError, type Provider, type ProviderReply, type ToolSpec, type Turn } from "./types.js";

/*
  One adapter for every provider that speaks the OpenAI-style chat completions format with tools.
  Verified against the official docs (Oct 2026):
  - Gemini:     https://ai.google.dev/gemini-api/docs/openai
  - Groq:       https://console.groq.com/docs/openai, /docs/tool-use
  - OpenRouter: https://openrouter.ai/docs/api-reference/limits (":free" models, 429 when over quota)
  Plain fetch on purpose: no extra dependency to keep audited.
*/

export interface CompatibleConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PRESETS = {
  gemini: { name: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "" }, // pick a ":free" model id
} as const;

export type PresetId = keyof typeof PRESETS;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const toMessages = (system: string, turns: Turn[]): ChatMessage[] => [
  { role: "system", content: system },
  ...turns.map((t): ChatMessage => {
    if (t.role === "user") return { role: "user", content: t.text };
    if (t.role === "tool") return { role: "tool", tool_call_id: t.callId, content: t.content };
    const msg: ChatMessage = { role: "assistant", content: t.text || null };
    if (t.toolCalls.length) {
      msg.tool_calls = t.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }));
    }
    return msg;
  }),
];

const retryAfterMs = (res: Response): number | undefined => {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

export function compatibleProvider(cfg: CompatibleConfig, fetchImpl: typeof fetch = fetch): Provider {
  return {
    id: cfg.id,
    label: `${cfg.name} · ${cfg.model}`,
    async complete(system: string, turns: Turn[], tools: ToolSpec[]): Promise<ProviderReply> {
      let res: Response;
      try {
        res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: cfg.model,
            messages: toMessages(system, turns),
            tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
            tool_choice: "auto",
          }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        throw new ProviderError(cfg.id, err instanceof Error ? err.message : "network error");
      }
      // 429 = rate or daily limit; 402 = OpenRouter out of credit. Both mean "use another provider for a while".
      if (res.status === 429 || res.status === 402) throw new QuotaError(cfg.id, retryAfterMs(res));
      if (!res.ok) throw new ProviderError(cfg.id, `HTTP ${res.status}`);

      const body = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] } }[] };
      const message = body.choices?.[0]?.message;
      if (!message) throw new ProviderError(cfg.id, "empty reply");
      const toolCalls = (message.tool_calls ?? []).map((c) => {
        let args: Record<string, unknown> = {};
        try {
          args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
        } catch {
          args = { _invalid_json: c.function.arguments };
        }
        return { id: c.id, name: c.function.name, args };
      });
      return { text: message.content ?? "", toolCalls };
    },
  };
}
