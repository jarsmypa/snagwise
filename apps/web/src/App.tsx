import { useEffect, useState } from "react";
import { formatCents } from "@snagwise/core";

interface Budget {
  month: string;
  currency: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
}

interface Health {
  channel3: boolean;
  paypal: boolean;
}

// Skeleton screen: proves web ↔ API wiring. The real UI (agent chat, wallet, spending) lands in week 2.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/health").then((r) => r.json()), fetch("/api/budget").then((r) => r.json())])
      .then(([h, b]) => {
        setHealth(h as Health);
        setBudget(b as Budget);
      })
      .catch(() => setError("The API is not running. Start it with npm run dev:api."));
  }, []);

  return (
    <main>
      <h1>Snagwise</h1>
      <p className="lede">Tell it what you like and what you can spend. It finds the deal, watches the price and buys with PayPal when it fits.</p>
      {error && <p role="alert">{error}</p>}
      {health && (
        <ul className="status">
          <li>Product search: {health.channel3 ? "connected" : "missing key"}</li>
          <li>PayPal sandbox: {health.paypal ? "connected" : "missing credentials"}</li>
        </ul>
      )}
      {budget && (
        <p>
          {budget.month}: {budget.currency} {formatCents(budget.spentCents)} spent of {formatCents(budget.budgetCents)}
        </p>
      )}
    </main>
  );
}
