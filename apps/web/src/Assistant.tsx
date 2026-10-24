import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@snagwise/core";
import { api, ApiError, storage, type AgentReply, type Byok, type Config } from "./api";
import { PayPalButton } from "./PayPalButton";
import { useI18n, type Key } from "./i18n";

type Message = { role: "user"; text: string } | ({ role: "assistant" } & Omit<AgentReply, "conversationId" | "walletChanged">);

const PROVIDERS: { id: Byok["provider"]; label: string; hint: Key }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", hint: "byok.hintClaude" },
  { id: "gemini", label: "Gemini (Google AI Studio)", hint: "byok.hintFree" },
  { id: "groq", label: "Groq", hint: "byok.hintFree" },
  { id: "openrouter", label: "OpenRouter", hint: "byok.hintOpenRouter" },
];

// First-run prompts: each one exercises a different tool (budget, taste + search, wallet + purchase rules).
const SUGGESTIONS: Key[] = ["assistant.s1", "assistant.s2", "assistant.s3", "assistant.s4"];

// Server reasons for a handoff, in the user's language.
const HANDOFF_REASON: Record<string, Key> = {
  "usage limit reached": "handoff.limit",
  "provider error": "handoff.error",
};

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
  const { t } = useI18n();
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
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  // A saved choice can point to a key that was disconnected or a provider no longer configured.
  const selected = choice === AUTO || freeProviders.some((p) => p.id === choice) || (byok && byokId(byok) === choice) ? choice : AUTO;

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
      <h2 id="assistant-title">{t("tab.assistant")}</h2>
      <p className="ai-note">{t("assistant.aiNote")}</p>
      {activeSkills.length > 0 && <p className="ai-note">{t("assistant.usingSkills", { names: activeSkills.join(", ") })}</p>}

      {freeProviders.length === 0 && !byok && <p className="hint">{t("assistant.noProvider")}</p>}

      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="hint">{t("assistant.tryIntro")}</p>
            <div className="suggestions">
              {SUGGESTIONS.map((key) => (
                <button key={key} type="button" onClick={() => void ask(t(key))} disabled={busy}>
                  {t(key)}
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
                  {t("handoff.text", { from: h.from, to: h.to, reason: HANDOFF_REASON[h.reason] ? t(HANDOFF_REASON[h.reason]!) : h.reason })}
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
                      <span className="deal">{t("deal.atYourPrice")}</span>
                    </span>
                  </div>
                  {p.reason && <p className="hint">{p.reason}</p>}
                  {paid.has(p.wishId) ? (
                    <p>{t("assistant.paid")}</p>
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
              <span className="hint small">{t("assistant.answeredBy", { name: m.provider })}</span>
            </div>
          ),
        )}
        {busy && <p className="hint">{t("assistant.busy")}</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={(e) => void send(e)} className="row">
        <label className="grow">
          <span className="sr-only">{t("assistant.message")}</span>
          <input name="message" maxLength={1000} placeholder={t("assistant.placeholder")} autoComplete="off" disabled={busy} />
        </label>
        <button disabled={busy}>{t("assistant.send")}</button>
      </form>

      {conversationId && (
        <details className="context" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void showContext()}>
          <summary>{t("assistant.contextFile")}</summary>
          <pre>{contextMd ?? t("common.loading")}</pre>
        </details>
      )}

      {/* AI choice and personal keys: rarely needed ("Auto" is the right default), so they stay folded below the chat. */}
      <details className="byok">
        <summary>{byok ? t("assistant.settingsConnected") : t("assistant.settings")}</summary>
        {(freeProviders.length > 0 || byok) && (
          <div className="stack">
            <label>
              {t("assistant.ai")}
              <select
                value={selected}
                onChange={(e) => {
                  setChoice(e.target.value);
                  storage.set(AI_CHOICE_KEY, e.target.value);
                }}
              >
                <option value={AUTO}>{t("assistant.auto")}</option>
                {byok && <option value={byokId(byok)}>{t("assistant.yourKey", { name: PROVIDERS.find((p) => p.id === byok.provider)?.label ?? "" })}</option>}
                {freeProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t("assistant.free", { name: p.label })}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint small">{t("assistant.backup")}</p>
          </div>
        )}
        <h3>{byok ? t("byok.connectedTitle") : t("byok.title")}</h3>
        <p className="hint">{t("byok.privacy")}</p>
        <form onSubmit={saveByok} className="stack">
          <label>
            {t("byok.provider")}
            <select name="provider" defaultValue={byok?.provider ?? "anthropic"}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({t(p.hint)})
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("byok.key")}
            <input name="apiKey" type="password" autoComplete="off" required minLength={10} placeholder={byok ? t("byok.connectedPlaceholder") : ""} />
          </label>
          <label>
            {t("byok.model")}
            <input name="model" defaultValue={byok?.model ?? ""} placeholder={t("byok.modelPlaceholder")} />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t("byok.remember")}
          </label>
          <div className="row">
            <button>{t("byok.connect")}</button>
            {byok && (
              <button type="button" className="quiet" onClick={clearByok}>
                {t("byok.disconnect")}
              </button>
            )}
          </div>
        </form>
      </details>
    </section>
  );
}
