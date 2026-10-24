/*
  Provider-neutral shapes for the agent loop. Every AI provider adapter translates
  to and from these, so the loop, the tools and the handoff file never depend on one vendor.
*/

export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type Turn =
  | { role: "user"; text: string }
  // raw: the provider's own copy of the turn, replayed unchanged to the same provider (needed for Claude's thinking blocks).
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw?: { provider: string; content: unknown } }
  | { role: "tool"; callId: string; name: string; content: string };

export interface ProviderReply {
  text: string;
  toolCalls: ToolCall[];
  raw?: unknown;
}

export interface Provider {
  id: string; // stable key, e.g. "groq"
  label: string; // shown to the user, e.g. "Groq · qwen/qwen3.8-27b"
  complete(system: string, turns: Turn[], tools: ToolSpec[]): Promise<ProviderReply>;
}

// The provider is out of quota (HTTP 429 and friends): rotate to the next one and cool this one down.
export class QuotaError extends Error {
  constructor(
    readonly provider: string,
    readonly retryAfterMs?: number,
  ) {
    super(`${provider} is out of quota`);
  }
}

// Any other provider failure (network, 5xx, malformed reply): rotate without a long cooldown.
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}
