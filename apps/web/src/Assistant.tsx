import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@snagwise/core";
import { api, ApiError, storage, type AgentReply, type Byok, type Config } from "./api";
import { PayPalButton } from "./PayPalButton";

type Message = { role: "user"; text: string } | ({ role: "assistant" } & Omit<AgentReply, "conversationId" | "walletChanged">);

const PROVIDERS: { id: Byok["provider"]; label: string; hint: string }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", hint: "Defaults to claude-opus-5-5" },
  { id: "gemini", label: "Gemini (Google AI Studio)", hint: "Free tier available" },
  { id: "groq", label: "Groq", hint: "Free tier available" },
  { id: "openrouter", label: "OpenRouter", hint: "Set a model, e.g. one ending in :free" },
];

// First-run prompts: each one exercises a different tool (budget, taste + search, wallet + purchase rules).
const SUGGESTIONS = [
  "What's left in my budget this month?",
  "Find wireless earbuds under $80 that match my taste",
  "Is anything in my wallet at my target price right now?",
  "A gift under $50 for someone who loves coffee",
];

const BYOK_KEY = "snagwise.byok";
const AI_CHOICE_KEY = "snagwise.ai";
const AUTO = "auto";

// Models often answer with **bold**: show it as bold, as React elements (never as HTML).
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  );
}

// Provider id the server gives a connected personal key.
const byokId = (b: Byok) => (b.provider === "anthropic" ? "anthropic" : `byok-${b.provider}`);
const money = formatMoney;

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
  const [freeProviders, setFreeProviders] = useState<{ id: string; label: string }[]>([]);
  const [choice, setChoice] = useState(() => storage.get(AI_CHOICE_KEY) ?? AUTO);
  const [contextMd, setContextMd] = useState<string | null>(null);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  // A saved choice can point to a key that was disconnected or a provider no longer configured.
  const selected = choice === AUTO || freeProviders.some((p) => p.id === choice) || (byok && byokId(byok) === choice) ? choice : AUTO;

  const [activeSkills, setActiveSkills] = useState<string[]>([]);

  useEffect(() => {
    api.freeProviders().then(setFreeProviders).catch(() => undefined);
    api
      .skills()
      .then((r) => setActiveSkills(r.skills.filter((s) => s.active).map((s) => s.name)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message || busy) return;
    form.reset();
    void ask(message);
  };

  const ask = async (message: string) => {
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    setError(null);
    try {
      const res = await api.ask(message, conversationId, byok, selected === AUTO ? null : selected);
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
      <p className="ai-note">
        Answers come from AI models and can be wrong. Prices come from live store listings, and nothing is bought until you approve it in PayPal.
      </p>
      {activeSkills.length > 0 && <p className="ai-note">Using SnagSkills: {activeSkills.join(", ")}.</p>}

      {freeProviders.length === 0 && !byok ? (
        <p className="hint">No free AI provider is set up on this server. Connect your own key below.</p>
      ) : (
        <div className="row">
          <label>
            AI
            <select
              value={selected}
              onChange={(e) => {
                setChoice(e.target.value);
                storage.set(AI_CHOICE_KEY, e.target.value);
              }}
            >
              <option value={AUTO}>Auto · rotate when one hits its limit</option>
              {byok && <option value={byokId(byok)}>Your key · {PROVIDERS.find((p) => p.id === byok.provider)?.label}</option>}
              {freeProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · free
                </option>
              ))}
            </select>
          </label>
          <p className="hint small">The others stay as backup and pick up from the shared context file.</p>
        </div>
      )}

      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="hint">Ask in your own words, in any language. For example:</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
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
              <p className="reply">
                <RichText text={m.reply} />
              </p>
              {m.proposals.map((p) => (
                <div key={p.wishId} className="proposal">
                  <div className="row spread">
                    <strong>{p.title}</strong>
                    <span className="row">
                      <span className="money">{money(p.priceCents)}</span>
                      <span className="deal">At your price</span>
                    </span>
                  </div>
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
              <span className="hint small">AI answer · {m.provider}</span>
            </div>
          ),
        )}
        {busy && <p className="hint">Checking products, prices and your budget…</p>}
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
                  {p.label} ({p.hint})
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
