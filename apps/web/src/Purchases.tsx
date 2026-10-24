import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@snagwise/core";
import { api, type Purchase } from "./api";
import { useI18n } from "./i18n";

// Purchases made through Snagwise, each with 24 hours to change your mind (a full PayPal refund).
export function Purchases({ onChange }: { onChange: () => void }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Purchase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.purchases());
    } catch {
      // Nothing to show; spending still works.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refund = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api.refund(id);
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;
  const hoursLeft = (until: string) => Math.max(1, Math.round((Date.parse(until) - Date.now()) / 3_600_000));

  return (
    <div className="purchases">
      <h3>{t("purchases.title")}</h3>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <span>
              <strong>{p.merchant}</strong> · {p.category}
              <br />
              <span className="hint small">{new Date(p.date).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span>
            </span>
            <span className={`money${p.refundedAt ? " refunded" : ""}`}>{formatMoney(p.amountCents)}</span>
            {p.refundedAt ? (
              <span className="hint small">{t("purchases.refunded")}</span>
            ) : p.refundableUntil ? (
              <button className="quiet" disabled={busy === p.id} onClick={() => void refund(p.id)} title={t("purchases.undoHint")}>
                {busy === p.id ? t("purchases.undoing") : t("purchases.undo", { h: hoursLeft(p.refundableUntil) })}
              </button>
            ) : (
              <span className="hint small">{t("purchases.kept")}</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
