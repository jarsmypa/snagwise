import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney, type Area, type TitleId } from "@snagwise/core";
import { api, type Me } from "./api";
import { useI18n, type Key } from "./i18n";

const POLL_MS = 15_000;
const TOAST_MS = 6_000;

// A medal: the same shape for every achievement, colored by the area it belongs to.
export function Medal() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M13 3h6l3 9h-6zM27 3h-6l-3 9h6z" fill="currentColor" opacity="0.55" />
      <circle cx="20" cy="24" r="12" fill="currentColor" />
      <path d="M20 17.5l2 4.1 4.5.6-3.3 3.1.8 4.5-4-2.2-4 2.2.8-4.5-3.3-3.1 4.5-.6z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

const titleKey = (id: TitleId) => `title.${id}` as Key;
const titleHint = (id: TitleId) => `title.${id}.hint` as Key;
const achName = (id: string) => `ach.${id}` as Key;
const achDesc = (id: string) => `ach.${id}.desc` as Key;

function progressLabel(id: string, progress: number, goal: number): string {
  // Money achievements count cents; everything else counts actions.
  return id.startsWith("saved_") ? `${formatMoney(progress)} / ${formatMoney(goal)}` : `${progress} / ${goal}`;
}

// The shopper card: friendly title, tags and achievements, plus a one-time toast for each new unlock.
export function ShopperCard({ refreshKey }: { refreshKey: string }) {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ ids: string[]; area: Area } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.me();
      setMe(res);
      if (res.newlyUnlocked.length) {
        const first = res.achievements.find((a) => a.id === res.newlyUnlocked[0]);
        setToast({ ids: res.newlyUnlocked, area: first?.area ?? "assistant" });
      }
    } catch {
      // The header never breaks because the profile failed; the next poll retries.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!me) return null;
  const unlocked = me.achievements.filter((a) => a.unlocked).length;
  const allTags = [...me.styles.map((s) => t(titleKey(s))), ...me.tags];

  return (
    <>
      <button className="me-button" onClick={() => setOpen(true)} aria-haspopup="dialog" title={t("me.open")}>
        <svg viewBox="0 0 40 40" width="20" height="20" aria-hidden="true" style={{ color: "var(--deal)", flex: "none" }}>
          <circle cx="20" cy="24" r="12" fill="currentColor" />
          <path d="M13 3h6l3 9h-6zM27 3h-6l-3 9h6z" fill="currentColor" opacity="0.7" />
        </svg>
        <span>{t(titleKey(me.title))}</span>
      </button>

      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="me-title" onClick={() => setOpen(false)}>
          <div className="modal-body me-card" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="me-hero">
              <span className="small">{t("me.youAre")}</span>
              <span className="me-title" id="me-title">
                {t(titleKey(me.title))}
              </span>
              <p>{t(titleHint(me.title))}</p>
              {allTags.length > 0 && (
                <ul className="tags" aria-label={t("me.tags")}>
                  {allTags.map((tag) => (
                    <li key={tag}>#{tag.toLowerCase().replace(/\s+/g, "")}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="row spread">
              <h3>{t("me.achievements")}</h3>
              <span className="hint">{t("me.count", { n: unlocked, total: me.achievements.length })}</span>
            </div>
            <ul className="achievements">
              {me.achievements.map((a) => (
                <li key={a.id} data-area={a.area} className={a.unlocked ? "" : "locked"}>
                  <Medal />
                  <strong>{t(achName(a.id))}</strong>
                  <span className="desc">{t(achDesc(a.id))}</span>
                  {!a.unlocked && (
                    <span>
                      <span className="small">{progressLabel(a.id, a.progress, a.goal)}</span>
                      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={a.progress}>
                        <div style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                      </div>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint small">{t("me.privacy")}</p>
            <button className="link" onClick={() => setOpen(false)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" data-area={toast.area}>
          <Medal />
          <span>
            <strong>{t("me.unlocked", { n: toast.ids.length })}</strong>
            <br />
            {toast.ids.map((id) => t(achName(id))).join(" · ")}
          </span>
          <button
            onClick={() => {
              setToast(null);
              setOpen(true);
            }}
          >
            {t("me.see")}
          </button>
        </div>
      )}
    </>
  );
}
