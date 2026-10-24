import type { Offer } from "./index.js";

/*
  SnagSkills: shopping know-how written by the community, as Markdown with a small header.

    ---
    name: Gamer Deals
    id: gamer-deals
    author: someone
    version: 1
    description: One line on what it helps with.
    categories: Video Games, Consoles
    prefer_stores: store-a.com, store-b.com
    avoid_stores: shady-keys.example
    ---
    Tips in plain Markdown…

  A skill is advice, never authority: the agent reads it as tips, and it can only nudge ranking.
  It cannot pay, change the budget or act without the user.
*/

export interface Skill {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  categories: string[];
  preferStores: string[];
  avoidStores: string[];
  body: string;
}

export const SKILL_LIMITS = { body: 4000, name: 60, description: 200, listItems: 20, active: 3 };

const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ID = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export type ParseResult = { ok: true; skill: Skill } | { ok: false; errors: string[] };

export function parseSkill(markdown: string): ParseResult {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return { ok: false, errors: ["Start the file with a header between two '---' lines."] };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([a-z_]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  const body = match[2]!.trim();
  const errors: string[] = [];

  const name = meta.name ?? "";
  const id = meta.id ?? "";
  if (!name || name.length > SKILL_LIMITS.name) errors.push(`name is required (up to ${SKILL_LIMITS.name} characters).`);
  if (!ID.test(id)) errors.push("id must be 3-50 lowercase letters, numbers or dashes, e.g. gamer-deals.");
  const description = meta.description ?? "";
  if (!description || description.length > SKILL_LIMITS.description) errors.push(`description is required (up to ${SKILL_LIMITS.description} characters).`);
  if (!body) errors.push("Add some tips below the header.");
  if (body.length > SKILL_LIMITS.body) errors.push(`Tips are limited to ${SKILL_LIMITS.body} characters so they fit small AI models.`);

  const preferStores = list(meta.prefer_stores).map((d) => d.toLowerCase());
  const avoidStores = list(meta.avoid_stores).map((d) => d.toLowerCase());
  const categories = list(meta.categories);
  for (const d of [...preferStores, ...avoidStores]) if (!DOMAIN.test(d)) errors.push(`"${d}" is not a store domain like store.com.`);
  if ([preferStores, avoidStores, categories].some((l) => l.length > SKILL_LIMITS.listItems)) errors.push(`Lists are limited to ${SKILL_LIMITS.listItems} items.`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    skill: { id, name, author: meta.author || "anonymous", version: meta.version || "1", description, categories, preferStores, avoidStores, body },
  };
}

const matchesDomain = (domain: string, store: string) => domain === store || domain.endsWith(`.${store}`);

// Ranking nudge from active skills: preferred stores up, stores to avoid well down.
export function skillScore(skills: readonly Skill[], offer: Offer): number {
  const domain = offer.domain.toLowerCase();
  let score = 0;
  for (const s of skills) {
    if (s.preferStores.some((d) => matchesDomain(domain, d))) score += 1.5;
    if (s.avoidStores.some((d) => matchesDomain(domain, d))) score -= 3;
  }
  return score;
}

export const SKILL_TEMPLATE = `---
name: My Shopping Skill
id: my-shopping-skill
author: your-name
version: 1
description: One line on what this skill helps people buy better.
categories: Category One, Category Two
prefer_stores:
avoid_stores:
---
## When to use it
- What kind of purchase this is for.

## Tips
- Where good prices usually show up, and when.
- What to check before buying (warranty, region, model year…).
- Red flags that mean "skip this deal".
`;
