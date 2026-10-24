import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@snagwise/core";
import { api, type PriceAlert } from "./api";
import { useI18n } from "./i18n";

const POLL_MS = 60_000;

function Bell() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

const notificationsSupported = () => typeof Notification !== "undefined";

// "5 min ago" / "hace 5 min" for the last days, the date after that.
function timeAgo(iso: string, locale: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (minutes < 60) return rtf.format(-Math.max(minutes, 0), "minute");
  if (minutes < 24 * 60) return rtf.format(-Math.round(minutes / 60), "hour");
  if (minutes < 7 * 24 * 60) return rtf.format(-Math.round(minutes / (24 * 60)), "day");
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

// Price alerts: a bell in the header band, an optional browser notification while the tab is in the background.
export function Alerts({ onOpenWallet, refreshKey }: { onOpenWallet: () => void; refreshKey: number }) {
  const { t, locale } = useI18n();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : "denied"));
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.alerts();
      // Notify only about alerts that appeared after the page loaded.
      if (seen.current && permission === "granted" && document.hidden) {
        for (const a of res.alerts) {
          if (!a.read && !seen.current.has(a.id))
            new Notification(t("alerts.notifyTitle", { title: a.title }), {
              body: t("alerts.notifyBody", { price: formatMoney(a.priceCents), store: a.store, target: formatMoney(a.targetCents) }),
              icon: "/icon.svg",
            });
        }
      }
      seen.current = new Set(res.alerts.map((a) => a.id));
      setAlerts(res.alerts);
      setUnread(res.unread);
    } catch {
      // The header must never break because alerts failed; the next poll retries.
    }
  }, [permission, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  // Close with Escape or a click anywhere outside the panel.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void api.readAlerts();
    }
  };

  const askPermission = async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  };

  return (
    <div className="alerts" ref={rootRef}>
      <button className="bell" onClick={toggle} aria-expanded={open} aria-label={unread ? t("alerts.labelNew", { n: unread }) : t("alerts.title")}>
        <Bell />
        {unread > 0 && <span className="count">{unread}</span>}
      </button>
      {open && (
        <div className="alerts-panel" role="dialog" aria-label={t("alerts.title")}>
          <strong>{t("alerts.title")}</strong>
          {alerts.length === 0 ? (
            <p className="hint">{t("alerts.empty")}</p>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li key={a.id} className={a.read ? "" : "new"}>
                  <span>{a.title}</span>
                  <span className="row">
                    <span className="money">{formatMoney(a.priceCents)}</span>
                    <span className="deal">{t("deal.atYourPrice")}</span>
                  </span>
                  <span className="hint small">
                    {a.store} · {t("wallet.targetShort")} {formatMoney(a.targetCents)} · {timeAgo(a.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button
              onClick={() => {
                setOpen(false);
                onOpenWallet();
              }}
            >
              {t("alerts.openWallet")}
            </button>
            {notificationsSupported() && permission === "default" && (
              <button className="quiet" onClick={() => void askPermission()}>
                {t("alerts.notifyMe")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
