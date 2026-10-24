# Snagwise

**An AI shopping agent that respects your budget.** Tell it what you like and what you can spend. It finds the deal, watches the price, and buys with PayPal when it fits — never over budget, never without your OK.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs on the **PayPal sandbox**; no real money moves.

> Status: early scaffold. See [docs/PLAN.md](docs/PLAN.md) for the build plan.

## How it works

1. **Describe what you want** in plain language. The agent searches a real product catalog ([Channel3](https://trychannel3.com)) and suggests options.
2. **Save deals to your wallet** with a target price.
3. **Set a monthly budget.** Snagwise tracks what you have spent this month.
4. **Price watch.** When an item drops to your target *and* fits the remaining budget, the agent proposes the purchase and explains why.
5. **You approve in PayPal.** The PayPal checkout is the human approval step; the server re-checks the rules before creating the order.

In this demo the sandbox order is collected by the app's own merchant test account (a "buy it for me" concierge). In production, the purchase would go through the store's own PayPal checkout.

## Stack

- `apps/web` — React + Vite
- `apps/api` — Hono + SQLite (`node:sqlite`), also serves the web app
- `packages/core` — pure budget and purchase rules, with tests
- PayPal Orders v2 (sandbox), Channel3 product search, Claude (Anthropic) for the agent

## Run locally

Requires Node 24+.

```bash
npm install
cp .env.example apps/api/.env   # fill in SANDBOX credentials only
npm run build --workspace @snagwise/api
npm run demo --workspace @snagwise/api   # optional: sample budget, expenses and wishlist
npm run dev:api                 # http://localhost:8080
npm run dev:web                 # http://localhost:5190
```

Checks: `npm run check` (typecheck, tests, build).

To try checkout, log in to the PayPal popup with a **sandbox personal (buyer) account** from the PayPal Developer Dashboard. On a hosted demo, set `SNAGWISE_SEED_DEMO=1` so the sample data is recreated on every boot.

## License

[MIT](LICENSE)
