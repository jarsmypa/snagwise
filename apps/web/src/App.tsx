import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatCents, monthOf, savingsCents, toCents, type Transaction, type Verdict } from "@snagwise/core";
import { api, type Budget, type Config, type Health, type Wish } from "./api";
import { PayPalButton } from "./PayPalButton";
import { Discover } from "./Discover";

type Tab = "discover" | "wallet" | "spending";
const TABS: { id: Tab; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "wallet", label: "Wallet" },
  { id: "spending", label: "Spending" },
];

const VERDICT_TEXT: Record<Verdict["reason"], string> = {
  within_target_and_budget: "At or below your target and within budget. Ready to buy.",
  above_target: "Still above your target price. Snagwise keeps watching.",
  over_budget: "Good price, but it would push you over this month's budget.",
  currency_mismatch: "Only offered in another currency.",
};

const money = (cents: number) => `$${formatCents(cents)}`;

// Working screens for the end-to-end flow. The agent chat and the design pass land in week 2.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("discover");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, c, b, t, w] = await Promise.all([api.health(), api.config(), api.budget(), api.transactions(), api.wishlist()]);
      setHealth(h);
      setConfig(c);
      setBudget(b);
      setTxs(t);
      setWishes(w);
      setError(null);
    } catch {
      setError("The API is not running. Start it with npm run dev:api.");
    }
  }, []);

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
  const purchases = txs.filter((t) => t.category === "wishlist").length;

  return (
    <main>
      <header>
        <h1>Snagwise</h1>
        <p className="lede">Tell it what you like and what you can spend. It finds the deal, watches the price and buys with PayPal when it fits.</p>
        {health && (
          <p className="hint">
            Product search {health.channel3 ? "connected" : "needs a key"} · PayPal sandbox {health.paypal ? "connected" : "needs credentials"}
          </p>
        )}
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p role="alert">{error}</p>}

      {tab === "discover" && <Discover onWalletChange={() => void refresh()} />}

      {tab === "wallet" && budget && (
        <section aria-labelledby="budget-title">
          <h2 id="budget-title">This month</h2>
          <p className="big">
            {money(budget.remainingCents)} <span className="hint">left of {money(budget.budgetCents)}</span>
          </p>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={budget.budgetCents} aria-valuenow={budget.spentCents}>
            <div style={{ width: `${Math.min(100, budget.budgetCents ? (budget.spentCents / budget.budgetCents) * 100 : 0)}%` }} />
          </div>
          <form onSubmit={saveBudget} className="row">
            <label>
              Monthly budget ($)
              <input name="budget" type="number" min="0" step="1" defaultValue={budget.budgetCents / 100} key={budget.budgetCents} />
            </label>
            <button disabled={busy === "budget"}>Save</button>
          </form>
        </section>
      )}

      {tab === "wallet" && (
      <section aria-labelledby="wallet-title">
        <h2 id="wallet-title">Wallet</h2>
        <form onSubmit={addWish} className="row">
          <label className="grow">
            What do you want?
            <input name="query" required minLength={2} placeholder="noise cancelling headphones" />
          </label>
          <label>
            Target ($)
            <input name="target" type="number" required min="1" step="0.01" />
          </label>
          <button disabled={busy === "add"}>Save</button>
        </form>
        {wishes.length === 0 && <p className="hint">Nothing saved yet.</p>}
        <ul className="cards">
          {wishes.map((w) => {
            const verdict = verdicts[w.id];
            const offer = w.bestOffer;
            return (
              <li key={w.id} className="card">
                <div className="row spread">
                  <strong>{w.query}</strong>
                  <span className="hint">target {money(w.targetCents)}</span>
                </div>
                {offer ? (
                  <p>
                    Best offer: <a href={offer.url} target="_blank" rel="noreferrer">{offer.title}</a> — {money(offer.priceCents)} at {offer.domain}
                    {savingsCents(offer) > 0 && <span className="hint"> (save {money(savingsCents(offer))})</span>}
                  </p>
                ) : (
                  <p className="hint">Price not checked yet.</p>
                )}
                {verdict !== undefined && <p>{verdict ? VERDICT_TEXT[verdict.reason] : "No offers found right now."}</p>}
                <div className="row">
                  <button onClick={() => void check(w.id)} disabled={busy === `check-${w.id}`}>
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
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {thisMonth.map((t) => (
                <tr key={t.id}>
                  <td>{t.date.slice(5, 10)}</td>
                  <td>{t.merchant}</td>
                  <td>{t.category}</td>
                  <td className="num">{money(t.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {purchases > 0 && <p className="hint">{purchases} purchase(s) made through Snagwise.</p>}
      </section>
      )}
    </main>
  );
}
