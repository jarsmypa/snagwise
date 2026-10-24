# Devpost submission draft (English, ready to paste)

Fill in the bracketed parts before submitting.

## Project name
Snagwise

## Tagline
An AI shopping agent that respects your budget — and learns from you and your friends.

## Inspiration
Deal hunting is noisy: endless alerts, impulse buys, and budgets that only show up after the money is gone. We wanted an assistant that knows what you like, knows what you can spend, and only asks you to pay when both line up.

## What it does
- **Assistant:** chat with an agent that searches real products, saves them to your wallet with a target price, and proposes a purchase only when the price hits the target *and* fits this month's budget. You approve in the PayPal checkout; the agent never pays by itself.
- **Discover:** swipe deals and say *what* you liked — the product, the price, or both. "Love the product, not the price" lowers the price Snagwise aims for in that category.
- **Recommend:** any deal becomes a 9:16 story card with a QR code. Scans and saves from friends feed back into your taste profile.
- **SnagSkills:** add community shopping know-how to your session (gamers, runners, coffee lovers…). The agent reads skills as tips, never as instructions.
- **Spending:** monthly budget, expenses and savings, in an AG Grid table, with a 24-hour "changed my mind" refund through PayPal.
- **Landed in Asunción:** for shoppers in Paraguay who buy from US stores through a Miami courier, the budget check uses the real landed cost (Florida sales tax, courier by weight, import tax) and shows guaraníes. Most deal apps stop at the store price.
- **Sidequests:** recommend deals; when friends act on them you unlock sidequests and earn small rewards paid with PayPal Payouts.

## How we built it
- React + Vite web app, Hono + SQLite API, shared TypeScript rules package with tests.
- **PayPal:** Orders v2 with the JS SDK buttons for purchases (the server re-validates target and budget before creating each order), the captures refund API for the 24-hour undo, and Payouts for sidequest rewards, all in the sandbox.
- **AI at zero cost:** free tiers of Gemini, Groq and OpenRouter rotate automatically when one hits its rate limit. Every request starts from a Markdown context file built from app state, so the next model continues exactly where the previous one stopped — even mid-answer. Users can bring their own Claude, Gemini, Groq or OpenRouter key.
- **Product data:** Channel3 product search.

## Challenges we ran into
- Keeping the agent coherent when the model changes underneath it: we stopped relying on provider chat history and made a provider-neutral context file the source of truth.
- Letting the community extend the agent without letting a skill take control of it: skills are labelled as advice in the context, size-limited, and can only nudge ranking.

## Accomplishments that we're proud of
- An agent that cannot overspend: the budget rule is enforced in code, not in the prompt.
- A full loop from "I like this" to a PayPal-approved purchase.

## What we learned
[Fill in]

## What's next for Snagwise
- Real checkout at the store through PayPal's agentic commerce protocols.
- A public SnagSkills directory with ratings.
- Friend accounts with private-by-default purchase sharing.

## Built with
typescript, react, vite, hono, sqlite, paypal-orders-api, paypal-js-sdk, gemini, groq, openrouter, claude, channel3, ag-grid, render

## Links
- Repository: [public GitHub URL]
- Demo: [Render URL] — access code: [code]
- Video: [YouTube URL]
