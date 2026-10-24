import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatCents } from "@snagwise/core";
import { api, ApiError, storage, type AgentReply, type Byok, type Config } from "./api";
import { PayPalButton } from "./PayPalButton";

type Message = { role: "user"; text: string } | ({ role: "assistant" } & Omit<AgentReply, "conversationId" | "walletChanged">);

const PROVIDERS: { id: Byok["provider"]; label: string; hint: string }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", hint: "Defaults to claude-opus-5-5" },
  { id: "gemini", label: "Gemini (Google AI Studio)", hint: "Free tier available" },
  { id: "groq", label: "Groq", hint: "Free tier available" },
  { id: "openrouter", label: "OpenRouter", hint: "Set a model, e.g. one ending in :free" },
];

const BYOK_KEY = "snagwise.byok";
const money = (cents: number) => `$${formatCents(cents)}`;

function loadByok(): Byok | null {
  try {
    const raw = storage.get(BYOK_KEY);
    return raw ? (JSON.parse(raw) as Byok) : null;
  } catch {
    return null;
  }
}

// Chat with the agent. Free AI providers rotate behind the scenes; the user can also bring their own key.
export function Assistant({ config, onWalletChange, onAccessNeeded }: { config: Config | null; onWalletChange: () => void; onAccessNeeded: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [byok, setByok] = useState<Byok | null>(loadByok);
  const [remember, setRemember] = useState(() => storage.get(BYOK_KEY) !== null);
  const [freeProviders, setFreeProviders] = useState<string[]>([]);
  const [contextMd, setContextMd] = useState<string | null>(null);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.freeProviders().then(setFreeProviders).catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message || busy) return;
    form.reset();
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    setError(null);
    try {
      const res = await api.ask(message, conversationId, byok);
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: "assistant", reply: res.reply, provider: res.provider, handoffs: res.handoffs, proposals: res.proposals }]);
      if (res.walletChanged) onWalletChange();
      setContextMd(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "access_code") onAccessNeeded();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveByok = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const apiKey = String(form.get("apiKey") ?? "").trim();
    if (!apiKey) return;
    const model = String(form.get("model") ?? "").trim();
    const next: Byok = { provider: form.get("provider") as Byok["provider"], apiKey, ...(model ? { model } : {}) };
    setByok(next);
    storage.set(BYOK_KEY, remember ? JSON.stringify(next) : null);
  };

  const clearByok = () => {
    setByok(null);
    storage.set(BYOK_KEY, null);
  };

  const showContext = async () => {
    if (!conversationId) return;
    try {
      setContextMd(await api.contextMd(conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section aria-labelledby="assistant-title">
      <h2 id="assistant-title">Assistant</h2>
      <p className="hint">
        {byok
          ? `Using your ${PROVIDERS.find((p) => p.id === byok.provider)?.label} key, with the free providers as backup.`
          : freeProviders.length
            ? `Free AI providers, rotating when one hits its limit: ${freeProviders.join(" → ")}`
            : "No free AI provider is set up on this server. Connect your own key below."}
      </p>

      <div className="chat" aria-live="polite">
        {messages.length === 0 && <p className="hint">Try: "Find wireless earbuds under $80 that match my taste" or "What's left in my budget?"</p>}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="bubble user">
              {m.text}
            </p>
          ) : (
            <div key={i} className="bubble assistant">
              {m.handoffs.map((h, j) => (
                <p key={j} className="handoff">
                  {h.from} stopped ({h.reason}). {h.to} took over from the context file.
                </p>
              ))}
              <p>{m.reply}</p>
              {m.proposals.map((p) => (
                <div key={p.wishId} className="proposal">
                  <strong>
                    {p.title} · {money(p.priceCents)}
                  </strong>
                  {p.reason && <p className="hint">{p.reason}</p>}
                  {paid.has(p.wishId) ? (
                    <p>Paid in the PayPal sandbox.</p>
                  ) : (
                    config && (
                      <PayPalButton
                        config={config}
                        wishId={p.wishId}
                        onPaid={() => {
                          setPaid((s) => new Set(s).add(p.wishId));
                          onWalletChange();
                        }}
                      />
                    )
                  )}
                </div>
              ))}
              <span className="hint small">{m.provider}</span>
            </div>
          ),
        )}
        {busy && <p className="hint">Thinking…</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={(e) => void send(e)} className="row">
        <label className="grow">
          <span className="sr-only">Message</span>
          <input name="message" maxLength={1000} placeholder="Ask Snagwise…" autoComplete="off" disabled={busy} />
        </label>
        <button disabled={busy}>Send</button>
      </form>

      {conversationId && (
        <details className="context" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void showContext()}>
          <summary>Context file shared between AI models (.md)</summary>
          <pre>{contextMd ?? "Loading…"}</pre>
        </details>
      )}

      <details className="byok">
        <summary>{byok ? "Your AI key (connected)" : "Use your own AI key"}</summary>
        <p className="hint">
          Your key is sent only with your messages, used for that request, and never stored or logged on the server. Usage is billed to your account with that provider.
        </p>
        <form onSubmit={saveByok} className="stack">
          <label>
            Provider
            <select name="provider" defaultValue={byok?.provider ?? "anthropic"}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.hint}
                </option>
              ))}
            </select>
          </label>
          <label>
            API key
            <input name="apiKey" type="password" autoComplete="off" required minLength={10} placeholder={byok ? "•••••••• (connected)" : ""} />
          </label>
          <label>
            Model (optional)
            <input name="model" defaultValue={byok?.model ?? ""} placeholder="Leave empty for the default" />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
          </label>
          <div className="row">
            <button>Connect</button>
            {byok && (
              <button type="button" className="quiet" onClick={clearByok}>
                Disconnect
              </button>
            )}
          </div>
        </form>
      </details>
    </section>
  );
}
