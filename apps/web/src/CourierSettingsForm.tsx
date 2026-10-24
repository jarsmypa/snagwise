import { useState, type FormEvent } from "react";
import type { CourierSettings } from "@snagwise/core";
import { api } from "./api";
import { useI18n } from "./i18n";

// "Buying from Paraguay": the courier rates that turn a US price into what it costs landed in Asunción.
export function CourierSettingsForm({ courier, onSaved }: { courier: CourierSettings; onSaved: (c: CourierSettings) => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (name: string) => Number(f.get(name));
    const next: CourierSettings = {
      enabled: f.get("enabled") === "on",
      ratePerKgCents: Math.round(num("rate") * 100),
      minKg: num("minKg"),
      usSalesTaxPct: num("salesTax"),
      importTaxPct: num("importTax"),
      pygPerUsd: Math.round(num("pyg")),
    };
    try {
      onSaved(await api.saveCourier(next));
      setSaved(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section aria-labelledby="courier-title">
      <hr className="tear" />
      <h2 id="courier-title">{t("courier.title")}</h2>
      <p className="hint">{t("courier.intro")}</p>
      <form className="stack" onSubmit={(e) => void submit(e)} onChange={() => setSaved(false)}>
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={courier.enabled} /> {t("courier.enabled")}
        </label>
        <div className="grid-2">
          <label>
            {t("courier.rate")}
            <input name="rate" type="number" min="0" max="200" step="0.01" defaultValue={courier.ratePerKgCents / 100} />
          </label>
          <label>
            {t("courier.minKg")}
            <input name="minKg" type="number" min="0" max="5" step="0.1" defaultValue={courier.minKg} />
          </label>
          <label>
            {t("courier.salesTax")}
            <input name="salesTax" type="number" min="0" max="20" step="0.1" defaultValue={courier.usSalesTaxPct} />
          </label>
          <label>
            {t("courier.importTax")}
            <input name="importTax" type="number" min="0" max="100" step="0.1" defaultValue={courier.importTaxPct} />
          </label>
          <label>
            {t("courier.pyg")}
            <input name="pyg" type="number" min="1000" max="100000" step="1" defaultValue={courier.pygPerUsd} />
          </label>
        </div>
        <p className="hint small">{t("courier.sources")}</p>
        <div className="row" style={{ alignItems: "center" }}>
          <button>{t("courier.save")}</button>
          {saved && <span className="hint">{t("courier.saved")}</span>}
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
