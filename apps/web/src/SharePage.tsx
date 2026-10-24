import { useEffect, useRef, useState } from "react";
import { formatMoney, savingsCents } from "@snagwise/core";
import { api, type Share } from "./api";
import { LangSwitch, useI18n } from "./i18n";

const money = formatMoney;

// Public page behind the QR. Opening it and saving the deal both teach Snagwise.
export function SharePage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const [share, setShare] = useState<Share | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    api
      .share(id)
      .then(setShare)
      .catch(() => setError(t("share.missing")));
    // Count one open per visit (StrictMode runs effects twice in development).
    if (!counted.current) {
      counted.current = true;
      void api.openShare(id).catch(() => undefined);
    }
  }, [id, t]);

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
      <div className="row spread">
        <p className="hint">{t("share.from")}</p>
        <LangSwitch light />
      </div>
      {error && <p role="alert">{error}</p>}
      {share && (
        <article className="card">
          {share.offer.imageUrl && <img className="share-photo" src={share.offer.imageUrl} alt="" />}
          <h1>{share.offer.title}</h1>
          <p className="hint">{[share.offer.brand, share.offer.domain].filter(Boolean).join(" · ")}</p>
          <p className="price">
            {money(share.offer.priceCents)}
            {savingsCents(share.offer) > 0 && <span className="deal">{t("deal.save", { amount: money(savingsCents(share.offer)) })}</span>}
          </p>
          <p className="hint">{t("share.priceWhen", { date: new Date(share.createdAt).toLocaleDateString(locale) })}</p>
          <div className="row">
            <button onClick={() => void save()} disabled={saved}>
              {saved ? t("share.saved") : t("share.save")}
            </button>
            <a className="button quiet" href={share.offer.url} target="_blank" rel="noreferrer">
              {t("share.open")}
            </a>
          </div>
          {saved && (
            <p>
              <a href="/">{t("share.openApp")}</a> {t("share.openAppRest")}
            </p>
          )}
        </article>
      )}
    </main>
  );
}
