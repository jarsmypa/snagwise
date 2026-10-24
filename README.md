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

## The agent runs on free AI, and on yours

- **Free providers, rotating.** The server can use the free tiers of Gemini, Groq and OpenRouter. When one hits its limit (HTTP 429), Snagwise cools it down and the next one answers.
- **A shared context file.** Every request starts from a Markdown file built from app state: taste profile, budget, wallet, actions already taken and the recent conversation. When a model hands off mid-conversation, or even mid-answer, the next one reads the same file and knows what was already done. You can open the file from the chat.
- **Bring your own key.** Users can connect their own Claude, Gemini, Groq or OpenRouter key. It is sent only with their messages and is never stored or logged on the server.
- **Nothing pays by itself.** The agent can search, save to the wallet and *propose* a purchase; the user approves it in the PayPal checkout.

## Stack

- `apps/web` — React + Vite
- `apps/api` — Hono + SQLite (`node:sqlite`), also serves the web app
- `packages/core` — pure budget and purchase rules, with tests
- PayPal Orders v2 (sandbox), Channel3 product search
- AI: free-tier Gemini / Groq / OpenRouter via their OpenAI-compatible APIs (plain `fetch`), and Claude through the official Anthropic SDK when the user brings a key

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
