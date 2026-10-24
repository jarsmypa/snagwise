import { useEffect, useRef, useState } from "react";
import { formatMoney, savingsCents } from "@snagwise/core";
import { api, type Share } from "./api";

const money = formatMoney;

// Public page behind the QR. Opening it and saving the deal both teach Snagwise.
export function SharePage({ id }: { id: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    api
      .share(id)
      .then(setShare)
      .catch(() => setError("This deal link does not exist or has expired."));
    // Count one open per visit (StrictMode runs effects twice in development).
    if (!counted.current) {
      counted.current = true;
      void api.openShare(id).catch(() => undefined);
    }
  }, [id]);

  const save = async () => {
    try {
      await api.saveShare(id);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main>
      <p className="hint">A friend recommended this with Snagwise</p>
      {error && <p role="alert">{error}</p>}
      {share && (
        <article className="card">
          {share.offer.imageUrl && <img className="share-photo" src={share.offer.imageUrl} alt="" />}
          <h1>{share.offer.title}</h1>
          <p className="hint">{[share.offer.brand, share.offer.domain].filter(Boolean).join(" · ")}</p>
          <p className="price">
            {money(share.offer.priceCents)}
            {savingsCents(share.offer) > 0 && <span className="deal">save {money(savingsCents(share.offer))}</span>}
          </p>
          <p className="hint">Price when shared, on {share.createdAt.slice(0, 10)}. It may have changed.</p>
          <div className="row">
            <button onClick={() => void save()} disabled={saved}>
              {saved ? "Saved to your wallet" : "Save to my wallet"}
            </button>
            <a className="button quiet" href={share.offer.url} target="_blank" rel="noreferrer">
              Open the deal
            </a>
          </div>
          {saved && (
            <p>
              <a href="/">Open Snagwise</a> to watch the price and buy within your budget.
            </p>
          )}
        </article>
      )}
    </main>
  );
}
