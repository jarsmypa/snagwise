import type { Offer } from "./index.js";
import { categoryGroup } from "./achievements.js";

/*
  "Landed in Asunción": what a US-store purchase really costs from Paraguay when it travels through
  a Miami courier box. Every rate is the user's to edit; the defaults are a starting point
  (Oct 2026 public courier rates: air USD 20.50–23.50/kg; personal shipments up to USD 1,000).
  Import tax defaults to 0 because some couriers include it and others don't: the user sets it.
*/

export interface CourierSettings {
  enabled: boolean;
  ratePerKgCents: number; // air courier, Miami → Asunción
  minKg: number; // couriers bill at least this much
  usSalesTaxPct: number; // the courier box is in Florida
  importTaxPct: number; // on the item value, if the courier doesn't include it
  pygPerUsd: number; // for showing guaraníes; reference rate, editable
}

export const DEFAULT_COURIER: CourierSettings = {
  enabled: false,
  ratePerKgCents: 2_200,
  minKg: 0.1,
  usSalesTaxPct: 7,
  importTaxPct: 0,
  pygPerUsd: 6_000,
};

export const PERSONAL_LIMIT_CENTS = 100_000; // USD 1,000 per shipment under the courier regime

// When the store doesn't publish a weight, a typical one for the kind of product.
const TYPICAL_KG = { fashion: 0.8, tech: 0.6, home: 2.5 } as const;
const DEFAULT_KG = 1;

export function shippingWeightKg(offer: Offer): { kg: number; estimated: boolean } {
  if (offer.weightGrams && offer.weightGrams > 0) return { kg: offer.weightGrams / 1000, estimated: false };
  const group = categoryGroup(offer.category);
  return { kg: group ? TYPICAL_KG[group] : DEFAULT_KG, estimated: true };
}

export interface LandedCost {
  productCents: number;
  salesTaxCents: number;
  courierCents: number;
  importTaxCents: number;
  totalCents: number;
  extraCents: number; // everything on top of the store price
  weightKg: number;
  weightEstimated: boolean;
  overPersonalLimit: boolean;
}

export function landedCost(offer: Offer, s: CourierSettings): LandedCost {
  const { kg, estimated } = shippingWeightKg(offer);
  // Couriers bill by the tenth of a kilo, rounded up, with a minimum.
  const billedKg = Math.max(s.minKg, Math.ceil(kg * 10) / 10);
  const salesTaxCents = Math.round((offer.priceCents * s.usSalesTaxPct) / 100);
  const courierCents = Math.round(billedKg * s.ratePerKgCents);
  const importTaxCents = Math.round((offer.priceCents * s.importTaxPct) / 100);
  const extraCents = salesTaxCents + courierCents + importTaxCents;
  return {
    productCents: offer.priceCents,
    salesTaxCents,
    courierCents,
    importTaxCents,
    totalCents: offer.priceCents + extraCents,
    extraCents,
    weightKg: billedKg,
    weightEstimated: estimated,
    overPersonalLimit: offer.priceCents > PERSONAL_LIMIT_CENTS,
  };
}

// What a purchase really costs the budget: landed when buying through a courier, the store price otherwise.
export function budgetCost(offer: Offer, s: CourierSettings | null): number {
  return s?.enabled ? landedCost(offer, s).totalCents : offer.priceCents;
}

export function toGuaranies(cents: number, pygPerUsd: number): number {
  return Math.round(((cents / 100) * pygPerUsd) / 1000) * 1000; // rounded to the thousand, like prices in shops
}

export function formatGuaranies(pyg: number): string {
  return `Gs. ${pyg.toLocaleString("es-PY")}`;
}
