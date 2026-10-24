# Snagwise

**An AI shopping agent that respects your budget.** Tell it what you like and what you can spend. It finds the deal, watches the price, and buys with PayPal when it fits — never over budget, never without your OK.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs on the **PayPal sandbox**; no real money moves.

## What it does

| | |
|---|---|
| **Assistant** | Chat with the agent: "find wireless earbuds under $80 that match my taste". It searches real products, saves them to your wallet and proposes purchases that fit your budget. |
| **Discover** | Swipe deals. Say *what* you liked — the product, the price, or both — and Snagwise learns your taste and your price comfort per category. |
| **Play money** | A store with real products and pretend money ("if I had $5,000…"). It scratches the shopping itch without spending, shows your shopping style, teaches your taste profile, and anything you still want goes to your real wallet with a target price. |
| **Price alerts** | A bell (and optional browser notification) when something in your wallet reaches your target price. |
| **English / Spanish** | The whole app switches language; the AI already answers in yours. |
| **Recommend** | Turn a deal you like into a 9:16 story card with a QR code. Friends who scan it can save the deal; every scan and save teaches your profile. |
| **SnagSkills** | Add shopping know-how from the community to your session: gamers, runners, coffee lovers… The agent reads them as tips and Discover ranks deals with them. |
| **Wallet** | Items you are watching, with a target price. A background price watch re-checks them. |
| **Spending** | This month's budget and expenses (AG Grid), plus what Snagwise saved you against list prices. |
| **PayPal** | Every purchase is approved by you in the PayPal checkout. The server re-checks target and budget before creating the order. |

In this demo the sandbox order is collected by the app's own merchant test account (a "buy it for me" concierge). In production, the purchase would go through the store's own PayPal checkout.

## AI tools used, and how

- **Free AI providers, rotating** — Gemini (Google AI Studio), Groq and OpenRouter free tiers, through their OpenAI-compatible chat APIs with tool calling. When one hits its limit (HTTP 429), it cools down (1 min, doubling up to 6 h, or the provider's `Retry-After`) and the next one answers. You can also pick one in the chat.
- **A shared context file** — every request starts from a Markdown file built from app state: taste profile, budget, wallet, active SnagSkills, actions already taken and the recent conversation. When a model hands off mid-conversation, or even mid-answer, the next one reads the same file and does not repeat what was done. Building it uses no AI. You can open it from the chat.
- **Bring your own key** — users can connect their own Claude (official Anthropic SDK, `claude-opus-5-5` by default, server-side refusal fallbacks on), Gemini, Groq or OpenRouter key. It is sent only with their messages and is never stored or logged.
- **Tools the agent can call** — `get_taste_profile`, `get_budget`, `list_wallet`, `search_products`, `add_to_wallet`, `propose_purchase`. None of them can pay.
- **Taste learning without a model** — swipes, the reason for each like, QR referrals and shared-card performance feed a profile (`packages/core/src/taste.ts`) that ranks results for both Discover and the agent.

## SnagSkills

Community skills are Markdown files in [`skills/`](skills/), added by pull request and reviewed. Users can also import their own (marked unverified). A skill is advice, never authority: it is placed in the agent's context as tips that cannot make it buy, change the budget or override the user, and it can only nudge search ranking (preferred stores up, stores to avoid down). Format and review rules: [skills/README.md](skills/README.md).

## Safety and cost

- Zero AI cost for the host: free tiers only; Claude is used only with the user's own key.
- Optional access code for the hosted demo, per-visitor hourly limit, and a daily cap on free-provider use.
- PayPal sandbox only. The agent proposes; the user approves in PayPal.
- `npm run check` runs typecheck, tests, build and `npm audit`.

## Run locally

Requires Node 24+.

```bash
npm ci
cp .env.example apps/api/.env   # fill in what you have: free AI keys, PayPal SANDBOX, Channel3
npm run build
npm run demo --workspace @snagwise/api   # optional: sample budget, expenses and wallet
npm start                                # http://localhost:8080
```

For development with hot reload: `npm run dev:api` and `npm run dev:web` (http://localhost:5190).

Without a Channel3 key, Discover and search use a small **sample catalog for development** (generic products, example.com links), labelled in the app.

## Testing instructions (for judges)

1. Open the hosted demo URL from the submission and enter the access code given there.
2. **Assistant:** ask "What's left in my budget?" and "Find a gaming headset that fits my taste". Open "Context file shared between AI models" under the chat to see the handoff file.
3. **Discover:** swipe a few deals; on a like, pick "The product" or "The price". Tap **Recommend** to get the QR story card.
4. **SnagSkills:** turn on "Gamer Deals", then ask the assistant about a controller.
5. **Wallet → Check price**, then pay with the PayPal button using a **sandbox personal (buyer) account**. The expense appears in **Spending**.

## Deploy

[`render.yaml`](render.yaml) deploys one free Render web service. Secrets are entered in the Render dashboard, never committed. The free disk is wiped on each deploy, so `SNAGWISE_SEED_DEMO=1` recreates the sample data on boot.

## Stack

- `apps/web` — React + Vite, AG Grid Community
- `apps/api` — Hono + SQLite (`node:sqlite`), also serves the web app
- `packages/core` — budget, purchase, taste and skill rules, with tests
- `skills/` — community SnagSkills
- PayPal Orders v2 (sandbox), Channel3 product search

## License

[MIT](LICENSE)
