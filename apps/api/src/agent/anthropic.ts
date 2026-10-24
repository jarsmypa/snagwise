import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, QuotaError, type Provider, type ProviderReply, type ToolSpec, type Turn } from "./types.js";

/*
  Claude, only with the user's own key ("bring your own AI"): the app never spends on Claude by itself.
  Server-side refusal fallbacks are on ("default" routing), so a declined request is retried
  on another Claude model inside the same call instead of failing the turn.
*/

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

function toMessages(turns: Turn[]): MessageParam[] {
  const out: MessageParam[] = [];
  let results: ToolResult[] = [];
  const flush = () => {
    // All results for one assistant turn go back together in a single user message.
    if (results.length) out.push({ role: "user", content: results });
    results = [];
  };
  for (const t of turns) {
    if (t.role === "tool") {
      results.push({ type: "tool_result", tool_use_id: t.callId, content: t.content });
      continue;
    }
    flush();
    if (t.role === "user") {
      out.push({ role: "user", content: t.text });
    } else if (t.raw?.provider === "anthropic") {
      // Replay Claude's own blocks unchanged (thinking blocks must not be edited).
      out.push({ role: "assistant", content: t.raw.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    } else {
      out.push({
        role: "assistant",
        content: [
          ...(t.text ? [{ type: "text" as const, text: t.text }] : []),
          ...t.toolCalls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.args })),
        ],
      });
    }
  }
  flush();
  return out;
}

export function anthropicProvider(apiKey: string, model = DEFAULT_CLAUDE_MODEL, client = new Anthropic({ apiKey, maxRetries: 1 })): Provider {
  return {
    id: "anthropic",
    label: `Claude · ${model}`,
    async complete(system: string, turns: Turn[], tools: ToolSpec[]): Promise<ProviderReply> {
      const params: Params = {
        model,
        max_tokens: 16000,
        system,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
        messages: toMessages(turns),
      };
      let response: Anthropic.Beta.Messages.BetaMessage;
      try {
        response = await client.beta.messages.create(params);
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          const seconds = Number(err.headers?.get("retry-after"));
          throw new QuotaError("anthropic", Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined);
        }
        if (err instanceof Anthropic.AuthenticationError) throw new ProviderError("anthropic", "the Claude API key was rejected");
        if (err instanceof Anthropic.APIError) throw new ProviderError("anthropic", `HTTP ${err.status}`);
        throw new ProviderError("anthropic", err instanceof Error ? err.message : "network error");
      }

      if (response.stop_reason === "refusal") {
        return { text: "Claude declined this request. Try rephrasing it.", toolCalls: [] };
      }
      let text = "";
      const toolCalls: ProviderReply["toolCalls"] = [];
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, args: block.input as Record<string, unknown> });
      }
      return { text, toolCalls, raw: response.content };
    },
  };
}
