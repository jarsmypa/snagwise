import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { formatCents, savingsCents, topCategories, type Offer, type Reason } from "@snagwise/core";
import { api } from "./api";
import { ShareCard } from "./ShareCard";

const SWIPE_THRESHOLD = 110;
const money = (cents: number) => `$${formatCents(cents)}`;

type Stage = { kind: "browse" } | { kind: "why" } | { kind: "liked"; reasons: Reason[] };

// Swipe to teach Snagwise your taste. Each answer, and why, feeds the profile the agent reads.
export function Discover({ onWalletChange }: { onWalletChange: () => void }) {
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
      setNote(`Saved. Snagwise will watch for ${money(target)} or less.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section aria-labelledby="discover-title">
      <div className="row spread">
        <h2 id="discover-title">Discover</h2>
        {sample && <span className="badge">Sample catalog · dev only</span>}
      </div>
      {learning && (
        <p className="hint">
          {learning.signals === 0
            ? "Swipe right on what you like, left on what you don't. Snagwise learns from every answer."
            : `Learning from ${learning.signals} ${learning.signals === 1 ? "signal" : "signals"}${learning.top.length ? ` · into ${learning.top.slice(0, 3).join(", ")}` : ""}`}
        </p>
      )}
      {error && <p role="alert">{error}</p>}

      {!card ? (
        <p className="hint">Loading more deals…</p>
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
                {card.category ?? "Deal"}
              </div>
            )}
            <div className="swipe-body">
              <strong>{card.title}</strong>
              <span className="hint">
                {[card.brand, card.domain].filter(Boolean).join(" · ")}
              </span>
              <p className="price">
                {money(card.priceCents)}
                {card.compareAtCents !== undefined && <s className="hint"> {money(card.compareAtCents)}</s>}
                {savingsCents(card) > 0 && <span className="save"> save {money(savingsCents(card))}</span>}
              </p>
            </div>
            {drag !== 0 && <span className={`stamp ${drag > 0 ? "yes" : "no"}`}>{drag > 0 ? "LIKE" : "NOPE"}</span>}
          </div>

          {stage.kind === "browse" && (
            <div className="row center">
              <button className="quiet" onClick={() => void answer(false, [])} aria-label="Not for me">
                ✕ Nope
              </button>
              <button onClick={() => setStage({ kind: "why" })} aria-label="I like it">
                ♥ Like
              </button>
            </div>
          )}

          {stage.kind === "why" && (
            <div className="panel">
              <p>What did you like?</p>
              <div className="row center">
                <button onClick={() => void answer(true, ["product"])}>The product</button>
                <button onClick={() => void answer(true, ["price"])}>The price</button>
                <button onClick={() => void answer(true, ["product", "price"])}>Both</button>
              </div>
              <button className="link" onClick={() => setStage({ kind: "browse" })}>
                Cancel
              </button>
            </div>
          )}

          {stage.kind === "liked" && (
            <div className="panel">
              <p>{note ?? "Noted. What next?"}</p>
              <div className="row center">
                {!note && <button onClick={() => void saveToWallet(card, stage.reasons)}>Save to wallet</button>}
                <button onClick={() => setSharing(card)}>Recommend</button>
                <button className="quiet" onClick={next}>
                  Next deal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {sharing && <ShareCard offer={sharing} onClose={() => setSharing(null)} />}
    </section>
  );
}
