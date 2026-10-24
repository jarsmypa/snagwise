import { formatGuaranies, formatMoney, landedCost, toGuaranies, type CourierSettings, type Offer } from "@snagwise/core";
import { useI18n } from "./i18n";

// "Landed in Asunción ≈ $X · Gs. Y", with the breakdown one tap away. Only when the user buys through a courier.
export function Landed({ offer, courier }: { offer: Offer; courier: CourierSettings | null }) {
  const { t } = useI18n();
  if (!courier?.enabled) return null;
  const l = landedCost(offer, courier);
  return (
    <details className="landed">
      <summary>
        {t("landed.total")} <span className="money">{formatMoney(l.totalCents)}</span>{" "}
        <span className="hint">≈ {formatGuaranies(toGuaranies(l.totalCents, courier.pygPerUsd))}</span>
      </summary>
      <dl>
        <dt>{t("landed.store")}</dt>
        <dd className="money">{formatMoney(l.productCents)}</dd>
        <dt>{t("landed.salesTax", { pct: courier.usSalesTaxPct })}</dt>
        <dd className="money">{formatMoney(l.salesTaxCents)}</dd>
        <dt>{t(l.weightEstimated ? "landed.courierEstimated" : "landed.courier", { kg: l.weightKg.toFixed(1) })}</dt>
        <dd className="money">{formatMoney(l.courierCents)}</dd>
        {courier.importTaxPct > 0 && (
          <>
            <dt>{t("landed.importTax", { pct: courier.importTaxPct })}</dt>
            <dd className="money">{formatMoney(l.importTaxCents)}</dd>
          </>
        )}
      </dl>
      {l.overPersonalLimit && <p className="warn-text">{t("landed.overLimit")}</p>}
    </details>
  );
}

// Guaraníes next to a dollar amount, when the user has the courier setup on.
export function Pyg({ cents, courier }: { cents: number; courier: CourierSettings | null }) {
  if (!courier?.enabled) return null;
  return <span className="hint small"> ≈ {formatGuaranies(toGuaranies(cents, courier.pygPerUsd))}</span>;
}
