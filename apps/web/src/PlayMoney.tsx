import { useState } from "react";
import { cartTotal, formatMoney, savingsCents, type Offer, type PlayResult, type PlayStyle } from "@snagwise/core";
import { api } from "./api";
import { useI18n, type Key } from "./i18n";

const AMOUNTS = [500, 1_000, 5_000, 10_000];
const money = formatMoney;

const STYLE_TEXT: Record<PlayStyle, { name: Key; text: Key }> = {
  deal_hunter: { name: "play.style.deal_hunter", text: "play.style.deal_hunter.text" },
  big_ticket: { name: "play.style.big_ticket", text: "play.style.big_ticket.text" },
  spread_out: { name: "play.style.spread_out", text: "play.style.spread_out.text" },
  saver: { name: "play.style.saver", text: "play.style.saver.text" },
  all_in: { name: "play.style.all_in", text: "play.style.all_in.text" },
};

type Stage = { kind: "pick" } | { kind: "shop"; budgetCents: number } | { kind: "result"; result: PlayResult; learned: string[]; cart: Offer[] };

// Play money: shop a real catalog as if you had $X. Nothing is charged; the picks teach Snagwise your taste,
// and anything you still want afterwards can go to the real wallet with a target price.
export function PlayMoney({ onWalletChange }: { onWalletChange: () => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [items, setItems] = useState<Offer[]>([]);
  const [sample, setSample] = useState(false);
  const [cart, setCart] = useState<Offer[]>([]);
  const [watching, setWatching] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (budgetCents: number) => {
    setBusy(true);
    setError(null);
    try {
      const store = await api.playStore();
      setItems(store.items);
      setSample(store.sample);
      setCart([]);
      setWatching({});
      setStage({ kind: "shop", budgetCents });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (budgetCents: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.playCheckout(budgetCents, cart);
      setStage({ kind: "result", result: res.result, learned: res.learned, cart });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Wanting it for real: watch it for a better price than the play-money one.
  const wantForReal = async (offer: Offer) => {
    const target = Math.round(offer.priceCents * 0.85);
    try {
      await api.addWishFromOffer(offer, target);
      setWatching((w) => ({ ...w, [offer.productId]: target }));
      onWalletChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (stage.kind === "pick") {
    return (
      <div className="play">
        <p className="play-lede">{t("play.lede")}</p>
        <p className="hint">{t("play.rules")}</p>
        <div className="amounts" role="group" aria-label={t("play.amountLabel")}>
          {AMOUNTS.map((a) => (
            <button key={a} className="quiet" disabled={busy} onClick={() => void start(a * 100)}>
              {t("play.ifIHad", { amount: `$${a.toLocaleString("en-US")}` })}
            </button>
          ))}
        </div>
        {busy && <p className="hint">{t("play.opening")}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (stage.kind === "shop") {
    const spent = cartTotal(cart);
    const left = stage.budgetCents - spent;
    const inCart = (o: Offer) => cart.some((c) => c.productId === o.productId);
    return (
      <div className="play">
        {sample && <span className="badge">{t("common.sampleCatalog")}</span>}
        <div className="cart-bar" aria-live="polite">
          <span>
            <span className="money">{money(left)}</span> {t("play.left")} · {t("play.inCart", { n: cart.length })}
          </span>
          <button disabled={cart.length === 0 || busy} onClick={() => void checkout(stage.budgetCents)}>
            {t("play.checkout")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <ul className="store">
          {items.map((o) => {
            const added = inCart(o);
            const tooMuch = !added && o.priceCents > left;
            return (
              <li key={o.productId} className={added ? "added" : ""}>
                {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <span className="thumb" aria-hidden="true" />}
                <span className="store-info">
                  <span>{o.title}</span>
                  <span className="hint small">{[o.brand, o.domain].filter(Boolean).join(" · ")}</span>
                  <span className="row" style={{ alignItems: "center" }}>
                    <span className="money">{money(o.priceCents)}</span>
                    {savingsCents(o) > 0 && <span className="deal">{t("deal.save", { amount: money(savingsCents(o)) })}</span>}
                  </span>
                </span>
                <button
                  className={added ? "" : "quiet"}
                  aria-pressed={added}
                  disabled={tooMuch}
                  title={tooMuch ? t("play.tooMuch") : undefined}
                  onClick={() => setCart((c) => (added ? c.filter((x) => x.productId !== o.productId) : [...c, o]))}
                >
                  {added ? t("play.added") : tooMuch ? t("play.tooMuchShort") : t("play.add")}
                </button>
              </li>
            );
          })}
        </ul>
        <button className="link" onClick={() => setStage({ kind: "pick" })}>
          {t("play.changeAmount")}
        </button>
      </div>
    );
  }

  const r = stage.result;
  return (
    <div className="play">
      <p className="play-total">
        {t("play.youWouldSpend")} <strong className="money">{money(r.spentCents)}</strong> {t("play.of", { amount: money(r.budgetCents) })}
      </p>
      {r.monthsOfBudget !== null && (
        <p className="hint">
          {r.monthsOfBudget >= 1
            ? t("play.months", { n: r.monthsOfBudget.toFixed(1) })
            : t("play.monthShare", { pct: Math.round(r.monthsOfBudget * 100) })}
        </p>
      )}

      {r.styles.length > 0 && (
        <ul className="styles">
          {r.styles.map((s) => (
            <li key={s}>
              <strong>{t(STYLE_TEXT[s].name)}</strong> {t(STYLE_TEXT[s].text)}
            </li>
          ))}
        </ul>
      )}

      <ul className="categories">
        {r.categories.map((c) => (
          <li key={c.category}>
            <span>{c.category}</span> <span className="money">{Math.round(c.share * 100)}%</span>
          </li>
        ))}
      </ul>

      {stage.learned.length > 0 && <p className="hint">{t("play.learned", { top: stage.learned.join(", ") })}</p>}

      <hr className="tear" />
      <h3>{t("play.forReal")}</h3>
      <p className="hint">{t("play.forRealHint")}</p>
      <ul className="store">
        {stage.cart.map((o) => (
          <li key={o.productId}>
            {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <span className="thumb" aria-hidden="true" />}
            <span className="store-info">
              <span>{o.title}</span>
              <span className="money">{money(o.priceCents)}</span>
            </span>
            {watching[o.productId] !== undefined ? (
              <span className="hint small">{t("play.watching", { amount: money(watching[o.productId]!) })}</span>
            ) : (
              <button className="quiet" onClick={() => void wantForReal(o)}>
                {t("play.wantIt")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <button onClick={() => setStage({ kind: "pick" })}>{t("play.again")}</button>
      </div>
    </div>
  );
}
