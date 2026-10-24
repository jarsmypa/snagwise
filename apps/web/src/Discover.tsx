import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { formatMoney, savingsCents, topCategories, type Offer, type Reason } from "@snagwise/core";
import { api } from "./api";
import { ShareCard } from "./ShareCard";
import { PlayMoney } from "./PlayMoney";
import { useI18n } from "./i18n";

const SWIPE_THRESHOLD = 110;
const money = formatMoney;

type Stage = { kind: "browse" } | { kind: "why" } | { kind: "liked"; reasons: Reason[] };
type Mode = "swipe" | "play";

// Two ways to teach Snagwise your taste: swipe real deals, or shop with play money.
export function Discover({ onWalletChange }: { onWalletChange: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("swipe");

  return (
    <section aria-labelledby="discover-title">
      <h2 id="discover-title">{t("tab.discover")}</h2>
      <div className="segmented" role="tablist" aria-label={t("discover.modes")}>
        <button role="tab" aria-selected={mode === "swipe"} className={mode === "swipe" ? "on" : ""} onClick={() => setMode("swipe")}>
          {t("discover.swipeMode")}
        </button>
        <button role="tab" aria-selected={mode === "play"} className={mode === "play" ? "on" : ""} onClick={() => setMode("play")}>
          {t("discover.playMode")}
        </button>
      </div>
      {mode === "swipe" ? <SwipeDeck onWalletChange={onWalletChange} /> : <PlayMoney onWalletChange={onWalletChange} />}
    </section>
  );
}

// Swipe to teach Snagwise your taste. Each answer, and why, feeds the profile the agent reads.
function SwipeDeck({ onWalletChange }: { onWalletChange: () => void }) {
  const { t } = useI18n();
  const [cards, setCards] = useState<Offer[]>([]);
  const [sample, setSample] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "browse" });
  const [learning, setLearning] = useState<{ top: string[]; signals: number } | null>(null);
  const [sharing, setSharing] = useState<Offer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [deck, p] = await Promise.all([api.discover(), api.profile()]);
      setCards(deck.cards);
      setSample(deck.sample);
      setLearning({ top: p.top, signals: p.profile.signals });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = cards[0];

  const next = useCallback(() => {
    setStage({ kind: "browse" });
    setNote(null);
    setDrag(0);
    setCards((cs) => {
      const rest = cs.slice(1);
      if (rest.length === 0) void load();
      return rest;
    });
  }, [load]);

  const answer = useCallback(
    async (liked: boolean, reasons: Reason[]) => {
      if (!card) return;
      try {
        const { profile } = await api.react(card, liked, reasons);
        setLearning({ top: topCategories(profile, 5), signals: profile.signals });
        if (liked) setStage({ kind: "liked", reasons });
        else next();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [card, next],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage.kind !== "browse" || sharing || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") void answer(false, []);
      if (e.key === "ArrowRight") setStage({ kind: "why" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, stage.kind, sharing]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (stage.kind !== "browse") return;
    start.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null) setDrag(e.clientX - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag < -SWIPE_THRESHOLD) void answer(false, []);
    else if (drag > SWIPE_THRESHOLD) setStage({ kind: "why" });
    setDrag(0);
  };

  const saveToWallet = async (offer: Offer, reasons: Reason[]) => {
    // Liked the product but not the price: watch it for a lower one.
    const target = reasons.includes("price") ? offer.priceCents : Math.round(offer.priceCents * 0.85);
    try {
      await api.addWishFromOffer(offer, target);
      onWalletChange();
      setNote(t("swipe.saved", { amount: money(target) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      {sample && <span className="badge">{t("common.sampleCatalog")}</span>}
      {learning && (
        <p className="hint">
          {learning.signals === 0
            ? t("swipe.intro")
            : learning.top.length
              ? t("swipe.learningInto", { n: learning.signals, top: learning.top.slice(0, 3).join(", ") })
              : t("swipe.learning", { n: learning.signals })}
        </p>
      )}
      {error && <p role="alert">{error}</p>}

      {!card ? (
        <p className="hint">{t("swipe.loading")}</p>
      ) : (
        <div className="deck">
          <div
            className="swipe-card"
            style={{ transform: `translateX(${drag}px) rotate(${drag / 20}deg)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {card.imageUrl ? (
              <img src={card.imageUrl} alt="" draggable={false} />
            ) : (
              <div className="placeholder" aria-hidden="true">
                {card.category ?? t("swipe.deal")}
              </div>
            )}
            <div className="swipe-body">
              <strong>{card.title}</strong>
              <span className="hint">{[card.brand, card.domain].filter(Boolean).join(" · ")}</span>
              <p className="price">
                {money(card.priceCents)}
                {card.compareAtCents !== undefined && card.compareAtCents > card.priceCents && <s>{money(card.compareAtCents)}</s>}
                {savingsCents(card) > 0 && <span className="deal">{t("deal.save", { amount: money(savingsCents(card)) })}</span>}
              </p>
            </div>
            {drag !== 0 && <span className={`stamp ${drag > 0 ? "yes" : "no"}`}>{drag > 0 ? t("swipe.stampYes") : t("swipe.stampNo")}</span>}
          </div>

          {stage.kind === "browse" && (
            <div className="row center">
              <button className="quiet" onClick={() => void answer(false, [])} aria-label={t("swipe.nopeLabel")}>
                ✕ {t("swipe.nope")}
              </button>
              <button onClick={() => setStage({ kind: "why" })} aria-label={t("swipe.likeLabel")}>
                ♥ {t("swipe.like")}
              </button>
            </div>
          )}

          {stage.kind === "why" && (
            <div className="panel">
              <p>{t("swipe.why")}</p>
              <div className="row center">
                <button className="quiet" onClick={() => void answer(true, ["product"])}>
                  {t("swipe.product")}
                </button>
                <button className="quiet" onClick={() => void answer(true, ["price"])}>
                  {t("swipe.price")}
                </button>
                <button className="quiet" onClick={() => void answer(true, ["product", "price"])}>
                  {t("swipe.both")}
                </button>
              </div>
              <button className="link" onClick={() => setStage({ kind: "browse" })}>
                {t("common.cancel")}
              </button>
            </div>
          )}

          {stage.kind === "liked" && (
            <div className="panel">
              <p>{note ?? t("swipe.noted")}</p>
              <div className="row center">
                {!note && <button onClick={() => void saveToWallet(card, stage.reasons)}>{t("swipe.saveWallet")}</button>}
                <button className="quiet" onClick={() => setSharing(card)}>
                  {t("swipe.recommend")}
                </button>
                <button className="quiet" onClick={next}>
                  {t("swipe.next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {sharing && <ShareCard offer={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}
