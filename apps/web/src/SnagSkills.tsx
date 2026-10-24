import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { SKILL_TEMPLATE } from "@snagwise/core";
import { api, type SkillItem } from "./api";
import { useI18n } from "./i18n";

const MAX_FILE_BYTES = 20_000;

// Community shopping know-how the user can add to their session. Tips are shown as plain text, never rendered as HTML.
export function SnagSkills() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [limit, setLimit] = useState(3);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.skills();
      setSkills(res.skills);
      setLimit(res.limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (task: () => Promise<unknown>, done?: string) => {
    try {
      await task();
      setError(null);
      setNote(done ?? null);
      await load();
    } catch (err) {
      setNote(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError(t("skills.tooBig"));
    void file.text().then(setDraft);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      await api.importSkill(draft);
      setDraft("");
    }, t("skills.imported"));
  };

  const templateUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(SKILL_TEMPLATE)}`;
  const activeCount = skills.filter((s) => s.active).length;

  return (
    <section aria-labelledby="skills-title">
      <h2 id="skills-title">{t("tab.skills")}</h2>
      <p className="hint">{t("skills.intro", { limit, on: activeCount })}</p>
      {error && <p role="alert">{error}</p>}
      {note && <p className="hint">{note}</p>}

      <ul className="cards">
        {skills.map((s) => (
          <li key={s.id} className="card">
            <div className="row spread">
              <strong>{s.name}</strong>
              <span className={`badge ${s.origin === "imported" ? "warn" : ""}`}>{s.origin === "community" ? t("skills.community") : t("skills.importedBadge")}</span>
            </div>
            <p>{s.description}</p>
            <p className="hint small">
              {t("skills.by", { author: s.author, version: s.version })}
              {s.categories.length > 0 && ` · ${s.categories.join(", ")}`}
            </p>
            {(s.preferStores.length > 0 || s.avoidStores.length > 0) && (
              <p className="hint small">
                {s.preferStores.length > 0 && `${t("skills.prefers", { stores: s.preferStores.join(", ") })} `}
                {s.avoidStores.length > 0 && t("skills.avoids", { stores: s.avoidStores.join(", ") })}
              </p>
            )}
            <div className="row">
              <button
                className={s.active ? "" : "quiet"}
                aria-pressed={s.active}
                onClick={() => void run(() => api.setSkillActive(s.id, !s.active))}
              >
                {s.active ? t("skills.on") : t("skills.add")}
              </button>
              <button className="quiet" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                {open === s.id ? t("skills.hide") : t("skills.read")}
              </button>
              {s.origin === "imported" && (
                <button className="quiet" onClick={() => void run(() => api.removeSkill(s.id), t("skills.removed"))}>
                  {t("common.remove")}
                </button>
              )}
            </div>
            {open === s.id && <pre className="skill-body">{s.body}</pre>}
          </li>
        ))}
      </ul>

      <details>
        <summary>{t("skills.importTitle")}</summary>
        <p className="hint">{t("skills.importHint")}</p>
        <form onSubmit={submit} className="stack wide">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} spellCheck={false} placeholder={SKILL_TEMPLATE} maxLength={MAX_FILE_BYTES} />
          <div className="row">
            <button disabled={!draft.trim()}>{t("skills.import")}</button>
            <label className="button quiet file">
              {t("skills.openFile")}
              <input type="file" accept=".md,text/markdown,text/plain" onChange={onFile} />
            </label>
            <a className="button quiet" href={templateUrl} download="my-snagskill.md">
              {t("skills.template")}
            </a>
          </div>
        </form>
        <p className="hint small">{t("skills.share")}</p>
      </details>
    </section>
  );
}
