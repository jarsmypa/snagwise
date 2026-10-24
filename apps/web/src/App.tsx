import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { formatMoney, monthOf, savingsCents, toCents, type Transaction, type Verdict } from "@snagwise/core";
import { api, ApiError, setAccessCode, type Budget, type Config, type Health, type Wish } from "./api";
import { PayPalButton } from "./PayPalButton";
import { Discover } from "./Discover";
import { Assistant } from "./Assistant";
import { SnagSkills } from "./SnagSkills";
import { Logo } from "./Logo";
// AG Grid is the heaviest dependency: load it only when the Spending tab opens.
const SpendingGrid = lazy(() => import("./SpendingGrid").then((m) => ({ default: m.SpendingGrid })));

type Tab = "assistant" | "discover" | "skills" | "wallet" | "spending";
const TABS: { id: Tab; label: string }[] = [
  { id: "assistant", label: "Assistant" },
  { id: "discover", label: "Discover" },
  { id: "skills", label: "SnagSkills" },
  { id: "wallet", label: "Wallet" },
  { id: "spending", label: "Spending" },
];

const VERDICT_TEXT: Record<Verdict["reason"], string> = {
  within_target_and_budget: "At or below your target and within budget. Ready to buy.",
  above_target: "Still above your target price. Snagwise keeps watching.",
  over_budget: "Good price, but it would push you over this month's budget.",
  currency_mismatch: "Only offered in another currency.",
};

const money = formatMoney;
// "2026-10" → "October"
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

// Working screens for the end-to-end flow. The agent chat and the design pass land in week 2.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("assistant");
  const [needAccess, setNeedAccess] = useState(false);
  const [savings, setSavings] = useState<{ savedCents: number; purchases: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, c, b, t, w, s] = await Promise.all([api.health(), api.config(), api.budget(), api.transactions(), api.wishlist(), api.savings()]);
      setSavings(s);
      setHealth(h);
      setConfig(c);
      setBudget(b);
      setTxs(t);
      setWishes(w);
      setError(null);
      setNeedAccess(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "access_code") setNeedAccess(true);
      else setError("The API is not running. Start it with npm run dev:api.");
    }
  }, []);

  const submitAccess = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAccessCode(String(new FormData(e.currentTarget).get("code") ?? "").trim());
    void refresh();
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const check = (id: string) =>
    run(`check-${id}`, async () => {
      const { wish, verdict } = await api.checkPrice(id);
      setWishes((ws) => ws.map((w) => (w.id === id ? wish : w)));
      setVerdicts((v) => ({ ...v, [id]: verdict }));
    });

  const addWish = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const target = e.currentTarget;
    void run("add", async () => {
      await api.addWish(String(form.get("query")), toCents(Number(form.get("target"))));
      target.reset();
      await refresh();
    });
  };

  const saveBudget = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = Number(new FormData(e.currentTarget).get("budget"));
    void run("budget", async () => setBudget(await api.setBudget(toCents(amount))));
  };

  const month = budget?.month;
  const thisMonth = month ? txs.filter((t) => monthOf(t.date) === month) : [];
  const byCategory = Object.entries(
    thisMonth.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.category]: (acc[t.category] ?? 0) + t.amountCents }), {}),
  ).sort((a, b) => b[1] - a[1]);

  if (needAccess) {
    return (
      <>
        <header className="band">
          <div className="band-inner">
            <Logo />
          </div>
        </header>
        <main>
          <p className="tagline">This demo is private. Enter the access code from the submission's testing instructions.</p>
          <form onSubmit={submitAccess} className="row">
            <label className="grow">
              Access code
              <input name="code" type="password" required autoComplete="off" />
            </label>
            <button>Enter</button>
          </form>
        </main>
      </>
    );
  }

  const spentShare = budget && budget.budgetCents ? Math.min(100, (budget.spentCents / budget.budgetCents) * 100) : 0;

  return (
    <>
      <header className="band">
        <div className="band-inner">
          <Logo />
          {budget && (
            <div className="left-to-spend" aria-live="polite">
              <strong>{money(budget.remainingCents)}</strong>
              left to spend in {monthName(budget.month)} · of {money(budget.budgetCents)}
              <div className="meter" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={budget.budgetCents} aria-valuenow={budget.spentCents}>
                <div style={{ width: `${spentShare}%` }} />
              </div>
            </div>
          )}
        </div>
      </header>
    <main>
      <div>
        <p className="tagline">Tell it what you like and what you can spend. It finds the deal, watches the price, and you approve every purchase in PayPal.</p>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && <p role="alert">{error}</p>}

      {tab === "assistant" && <Assistant config={config} onWalletChange={() => void refresh()} onAccessNeeded={() => setNeedAccess(true)} />}
      {tab === "discover" && <Discover onWalletChange={() => void refresh()} />}
      {tab === "skills" && <SnagSkills />}

      {tab === "wallet" && (
      <section aria-labelledby="wallet-title">
        <h2 id="wallet-title">Wallet</h2>
        <p className="hint">What you are watching. Snagwise re-checks prices and only offers to buy at or under your target, within the budget.</p>
        <form onSubmit={addWish} className="row">
          <label className="grow">
            What do you want?
            <input name="query" required minLength={2} placeholder="noise cancelling headphones" />
          </label>
          <label>
            Target price ($)
            <input name="target" type="number" required min="1" step="0.01" />
          </label>
          <button disabled={busy === "add"}>Watch it</button>
        </form>
        {wishes.length === 0 && <p className="hint">Nothing here yet. Save something from the Assistant or Discover, or type it above.</p>}
        <ul className="cards">
          {wishes.map((w) => {
            const verdict = verdicts[w.id];
            const offer = w.bestOffer;
            const atTarget = offer !== null && offer.priceCents <= w.targetCents;
            return (
              <li key={w.id} className="card">
                <div className="row spread">
                  <strong>{w.query}</strong>
                  <span className="hint">
                    target <span className="money">{money(w.targetCents)}</span>
                  </span>
                </div>
                {offer ? (
                  <p className="row" style={{ alignItems: "center" }}>
                    <span>
                      <a href={offer.url} target="_blank" rel="noreferrer">{offer.title}</a> at {offer.domain}:{" "}
                      <span className="money">{money(offer.priceCents)}</span>
                    </span>
                    {atTarget && <span className="deal">At your price{savingsCents(offer) > 0 ? ` · save ${money(savingsCents(offer))}` : ""}</span>}
                  </p>
                ) : (
                  <p className="hint">Price not checked yet.</p>
                )}
                {verdict !== undefined && <p>{verdict ? VERDICT_TEXT[verdict.reason] : "No offers found right now."}</p>}
                <div className="row">
                  <button className="quiet" onClick={() => void check(w.id)} disabled={busy === `check-${w.id}`}>
                    {busy === `check-${w.id}` ? "Checking…" : "Check price"}
                  </button>
                  <button className="quiet" onClick={() => void run(`rm-${w.id}`, async () => { await api.removeWish(w.id); await refresh(); })}>
                    Remove
                  </button>
                </div>
                {verdict?.buy && config && <PayPalButton config={config} wishId={w.id} onPaid={() => void refresh()} />}
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {tab === "spending" && (
      <section aria-labelledby="spending-title">
        <h2 id="spending-title">Spending</h2>
        {byCategory.length > 0 && (
          <ul className="categories">
            {byCategory.map(([category, cents]) => (
              <li key={category}>
                <span>{category}</span> <span>{money(cents)}</span>
              </li>
            ))}
          </ul>
        )}
        {thisMonth.length === 0 ? (
          <p className="hint">No expenses this month. Run npm run demo --workspace @snagwise/api for sample data.</p>
        ) : (
          <Suspense fallback={<p className="hint">Loading table…</p>}>
            <SpendingGrid rows={thisMonth} />
          </Suspense>
        )}
        {savings && savings.purchases > 0 && (
          <p className="savings-line">
            {savings.purchases === 1 ? "1 purchase" : `${savings.purchases} purchases`} through Snagwise
            {savings.savedCents > 0 && <span className="deal">saved {money(savings.savedCents)} vs. list prices</span>}
          </p>
        )}
      </section>
      )}

      {tab === "wallet" && budget && (
        <section aria-labelledby="budget-title">
          <hr className="tear" />
          <h2 id="budget-title">Monthly budget</h2>
          <p className="hint">Snagwise never proposes a purchase that would go over it.</p>
          <form onSubmit={saveBudget} className="row">
            <label>
              Budget for {monthName(budget.month)} ($)
              <input name="budget" type="number" min="0" step="1" defaultValue={budget.budgetCents / 100} key={budget.budgetCents} />
            </label>
            <button disabled={busy === "budget"}>Save budget</button>
          </form>
        </section>
      )}

      {health && (
        <footer className="status">
          Product search: {health.channel3 ? "Channel3 (live catalog)" : "sample catalog (dev only)"} · Payments: {health.paypal ? "PayPal sandbox" : "PayPal not set up"} · AI answers can be wrong; you approve
          every purchase.
        </footer>
      )}
    </main>
    </>
  );
}
