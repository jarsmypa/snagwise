import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { formatMoney, monthOf, savingsCents, toCents, type CourierSettings, type Offer, type Transaction, type Verdict } from "@snagwise/core";
import { api, ApiError, setAccessCode, type Budget, type Config, type Health, type Wish } from "./api";
import { PayPalButton } from "./PayPalButton";
import { Discover } from "./Discover";
import { Assistant } from "./Assistant";
import { SnagSkills } from "./SnagSkills";
import { Logo } from "./Logo";
import { Alerts } from "./Alerts";
import { ShopperCard } from "./ShopperCard";
import { ShareCard } from "./ShareCard";
import { Landed, Pyg } from "./Landed";
import { CourierSettingsForm } from "./CourierSettingsForm";
import { Purchases } from "./Purchases";
import { LangSwitch, useI18n, type Key } from "./i18n";
// AG Grid is the heaviest dependency: load it only when the Spending tab opens.
const SpendingGrid = lazy(() => import("./SpendingGrid").then((m) => ({ default: m.SpendingGrid })));

type Tab = "assistant" | "discover" | "skills" | "wallet" | "spending";
const TABS: { id: Tab; label: Key }[] = [
  { id: "assistant", label: "tab.assistant" },
  { id: "discover", label: "tab.discover" },
  { id: "skills", label: "tab.skills" },
  { id: "wallet", label: "tab.wallet" },
  { id: "spending", label: "tab.spending" },
];

const VERDICT_TEXT: Record<Verdict["reason"], Key> = {
  within_target_and_budget: "verdict.buy",
  above_target: "verdict.above",
  over_budget: "verdict.over",
  currency_mismatch: "verdict.currency",
};

const money = formatMoney;

export function App() {
  const { t, locale } = useI18n();
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
  const [alertsKey, setAlertsKey] = useState(0);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Offer | null>(null);
  const [courier, setCourier] = useState<CourierSettings | null>(null);

  // "2026-10" → "October" / "octubre"
  const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });

  const refresh = useCallback(async () => {
    try {
      const [h, c, b, tx, w, s, cs] = await Promise.all([api.health(), api.config(), api.budget(), api.transactions(), api.wishlist(), api.savings(), api.courier()]);
      setSavings(s);
      setCourier(cs);
      setHealth(h);
      setConfig(c);
      setBudget(b);
      setTxs(tx);
      setWishes(w);
      setError(null);
      setNeedAccess(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "access_code") setNeedAccess(true);
      else setError(t("app.apiDown"));
    }
  }, [t]);

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
      setAlertsKey((k) => k + 1);
    });

  const checkAll = () =>
    run("check-all", async () => {
      const res = await api.checkAll();
      setCheckNote(res.alerts ? t("wallet.checkAllHit", { n: res.alerts }) : t("wallet.checkAllNone", { n: res.updated }));
      setAlertsKey((k) => k + 1);
      await refresh();
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
  const thisMonth = month ? txs.filter((tx) => monthOf(tx.date) === month) : [];
  const byCategory = Object.entries(
    thisMonth.reduce<Record<string, number>>((acc, tx) => ({ ...acc, [tx.category]: (acc[tx.category] ?? 0) + tx.amountCents }), {}),
  ).sort((a, b) => b[1] - a[1]);

  if (needAccess) {
    return (
      <>
        <header className="band">
          <div className="band-inner">
            <Logo />
            <LangSwitch />
          </div>
        </header>
        <main>
          <p className="tagline">{t("access.intro")}</p>
          <form onSubmit={submitAccess} className="row">
            <label className="grow">
              {t("access.label")}
              <input name="code" type="password" required autoComplete="off" />
            </label>
            <button>{t("access.enter")}</button>
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
          <div className="band-tools">
            {budget && (
              <div className="left-to-spend" aria-live="polite">
                <strong>
                  {money(budget.remainingCents)}
                  <Pyg cents={budget.remainingCents} courier={courier} />
                </strong>
                {t("band.left", { month: monthName(budget.month), total: money(budget.budgetCents) })}
                <div className="meter" role="progressbar" aria-label={t("band.used")} aria-valuemin={0} aria-valuemax={budget.budgetCents} aria-valuenow={budget.spentCents}>
                  <div style={{ width: `${spentShare}%` }} />
                </div>
              </div>
            )}
            {/* Re-read the shopper card whenever something it counts may have changed. */}
            <ShopperCard refreshKey={`${tab}-${alertsKey}-${txs.length}-${wishes.length}`} />
            <Alerts refreshKey={alertsKey} onOpenWallet={() => setTab("wallet")} />
            <LangSwitch />
          </div>
        </div>
      </header>
      <main data-area={tab}>
        <div>
          <p className="tagline">{t("app.tagline")}</p>
          <nav className="tabs" aria-label={t("app.sections")}>
            {TABS.map((tb) => (
              <button key={tb.id} data-area={tb.id} className={tab === tb.id ? "active" : ""} aria-current={tab === tb.id ? "page" : undefined} onClick={() => setTab(tb.id)}>
                {t(tb.label)}
              </button>
            ))}
          </nav>
        </div>

        {error && <p role="alert">{error}</p>}

        {tab === "assistant" && <Assistant config={config} onWalletChange={() => void refresh()} onAccessNeeded={() => setNeedAccess(true)} />}
        {tab === "discover" && <Discover courier={courier} onWalletChange={() => void refresh()} />}
        {tab === "skills" && <SnagSkills />}

        {tab === "wallet" && (
          <section aria-labelledby="wallet-title">
            <h2 id="wallet-title">{t("tab.wallet")}</h2>
            <p className="hint">{t("wallet.intro")}</p>
            {health?.channel3 && wishes.length > 0 && (
              <p className="row" style={{ alignItems: "center" }}>
                <button className="quiet" onClick={() => void checkAll()} disabled={busy === "check-all"}>
                  {busy === "check-all" ? t("wallet.checkingAll") : t("wallet.checkAll")}
                </button>
                {checkNote && <span className="hint">{checkNote}</span>}
              </p>
            )}
            <form onSubmit={addWish} className="row">
              <label className="grow">
                {t("wallet.what")}
                <input name="query" required minLength={2} placeholder={t("wallet.whatPlaceholder")} />
              </label>
              <label>
                {t("wallet.target")}
                <input name="target" type="number" required min="1" step="0.01" />
              </label>
              <button disabled={busy === "add"}>{t("wallet.watch")}</button>
            </form>
            {wishes.length === 0 && <p className="hint">{t("wallet.empty")}</p>}
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
                        {t("wallet.targetShort")} <span className="money">{money(w.targetCents)}</span>
                      </span>
                    </div>
                    {offer ? (
                      <p className="row" style={{ alignItems: "center" }}>
                        <span>
                          <a href={offer.url} target="_blank" rel="noreferrer">
                            {offer.title}
                          </a>{" "}
                          {t("wallet.at", { store: offer.domain })} <span className="money">{money(offer.priceCents)}</span>
                        </span>
                        {atTarget && (
                          <span className="deal">
                            {t("deal.atYourPrice")}
                            {savingsCents(offer) > 0 ? ` · ${t("deal.save", { amount: money(savingsCents(offer)) })}` : ""}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="hint">{t("wallet.notChecked")}</p>
                    )}
                    {offer && <Landed offer={offer} courier={courier} />}
                    {verdict !== undefined && <p>{verdict ? t(VERDICT_TEXT[verdict.reason]) : t("wallet.noOffers")}</p>}
                    <div className="row">
                      <button className="quiet" onClick={() => void check(w.id)} disabled={busy === `check-${w.id}`}>
                        {busy === `check-${w.id}` ? t("wallet.checking") : t("wallet.check")}
                      </button>
                      <button
                        className="quiet"
                        onClick={() =>
                          void run(`rm-${w.id}`, async () => {
                            await api.removeWish(w.id);
                            await refresh();
                          })
                        }
                      >
                        {t("common.remove")}
                      </button>
                      {offer && (
                        <button className="quiet" onClick={() => setSharing(offer)}>
                          {t("swipe.recommend")}
                        </button>
                      )}
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
            <h2 id="spending-title">{t("tab.spending")}</h2>
            {byCategory.length > 0 && (
              <ul className="categories">
                {byCategory.map(([category, cents]) => (
                  <li key={category}>
                    <span>{category}</span> <span className="money">{money(cents)}</span>
                  </li>
                ))}
              </ul>
            )}
            {thisMonth.length === 0 ? (
              <p className="hint">{t("spending.empty")}</p>
            ) : (
              <Suspense fallback={<p className="hint">{t("spending.loading")}</p>}>
                <SpendingGrid rows={thisMonth} />
              </Suspense>
            )}
            <Purchases onChange={() => void refresh()} />
            {savings && savings.purchases > 0 && (
              <p className="savings-line">
                {t("spending.purchases", { n: savings.purchases })}
                {savings.savedCents > 0 && <span className="deal">{t("spending.saved", { amount: money(savings.savedCents) })}</span>}
              </p>
            )}
          </section>
        )}

        {tab === "wallet" && budget && (
          <section aria-labelledby="budget-title">
            <hr className="tear" />
            <h2 id="budget-title">{t("budget.title")}</h2>
            <p className="hint">{t("budget.intro")}</p>
            <form onSubmit={saveBudget} className="row">
              <label>
                {t("budget.label", { month: monthName(budget.month) })}
                <input name="budget" type="number" min="0" step="1" defaultValue={budget.budgetCents / 100} key={budget.budgetCents} />
              </label>
              <button disabled={busy === "budget"}>{t("budget.save")}</button>
            </form>
          </section>
        )}

        {tab === "wallet" && courier && <CourierSettingsForm courier={courier} onSaved={setCourier} />}

        {health && (
          <footer className="status">
            {t("footer.status", {
              search: health.channel3 ? t("footer.searchLive") : t("footer.searchSample"),
              pay: health.paypal ? t("footer.payOn") : t("footer.payOff"),
            })}
          </footer>
        )}
        {sharing && <ShareCard offer={sharing} onClose={() => setSharing(null)} />}
      </main>
    </>
  );
}
