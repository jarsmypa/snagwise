# SnagSkills

Shopping know-how from the community. Each `.md` file in this folder is a skill that anyone can add to their Snagwise session: the agent reads its tips when helping, and its store lists nudge how search results are ranked.

## Add a skill

1. Copy the template from the app (SnagSkills → "Start from the template") or from another skill here.
2. Fill in the header and the tips. Keep it practical: where good prices show up, what to check, red flags.
3. Open a pull request adding your file to `skills/`. Reviewers check it before it reaches everyone.

You can also import a skill straight into your own app (SnagSkills → Import). Imported skills are marked **unverified** and only affect your session.

## Header fields

| Field | Required | What it does |
|---|---|---|
| `name` | yes | Shown in the app (up to 60 characters) |
| `id` | yes | Unique, lowercase with dashes, e.g. `gamer-deals` |
| `description` | yes | One line, up to 200 characters |
| `author` | no | Your name or handle |
| `version` | no | Bump it when you change the tips |
| `categories` | no | Comma-separated product categories it applies to |
| `prefer_stores` | no | Comma-separated store domains to rank higher |
| `avoid_stores` | no | Comma-separated store domains to rank much lower |

Tips are limited to 4,000 characters so they fit free AI models with small context windows.

## Review rules

- Advice only. Skills are shown to the agent as tips, never as instructions: they cannot make it buy, change the budget, or ignore the user, and reviewers reject skills that try.
- No affiliate or referral links, no personal data, nothing a store paid for.
- Store lists must be explained in the tips (why prefer or avoid it).
- Claims should be things shoppers can check themselves.
