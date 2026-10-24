import type { Hono } from "hono";
import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSkill, SKILL_LIMITS, type Skill } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";

/*
  SnagSkills. Community skills are the reviewed .md files in the repo's skills/ folder
  (contributed by pull request). Users can also import their own, which stay "unverified"
  and only live in this app. At most a few are active at once, so they fit small AI models.
*/

export type SkillOrigin = "community" | "imported";

export function loadCommunitySkills(dir: string): Skill[] {
  if (!existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort()) {
    const parsed = parseSkill(readFileSync(join(dir, file), "utf8"));
    if (parsed.ok) skills.push(parsed.skill);
    else console.warn(`Skipping skill ${file}: ${parsed.errors.join(" ")}`);
  }
  return skills;
}

const MAX_IMPORT_BYTES = 20_000;

export function registerSkills(app: Hono, db: DB, community: Skill[]) {
  const communityIds = new Set(community.map((s) => s.id));

  const imported = (): Skill[] =>
    (db.prepare("SELECT markdown FROM user_skills ORDER BY created_at").all() as { markdown: string }[]).flatMap((r) => {
      const parsed = parseSkill(r.markdown);
      return parsed.ok ? [parsed.skill] : [];
    });
  const all = (): { skill: Skill; origin: SkillOrigin }[] => [
    ...community.map((skill) => ({ skill, origin: "community" as const })),
    ...imported().map((skill) => ({ skill, origin: "imported" as const })),
  ];
  const activeIds = (): string[] => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'active_skills'").get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as string[]) : [];
  };
  const setActive = (ids: string[]) =>
    db.prepare("INSERT INTO settings (key, value) VALUES ('active_skills', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(ids));
  const active = () => {
    const ids = activeIds();
    return all().filter((s) => ids.includes(s.skill.id));
  };

  app.get("/api/skills", (c) => {
    const ids = activeIds();
    return c.json({
      limit: SKILL_LIMITS.active,
      skills: all().map(({ skill, origin }) => ({ ...skill, origin, active: ids.includes(skill.id) })),
    });
  });

  app.post("/api/skills/import", async (c) => {
    const { markdown } = z.object({ markdown: z.string().max(MAX_IMPORT_BYTES) }).parse(await c.req.json());
    const parsed = parseSkill(markdown);
    if (!parsed.ok) return c.json({ error: "This skill has problems", errors: parsed.errors }, 400);
    if (communityIds.has(parsed.skill.id)) return c.json({ error: `A community skill already uses the id "${parsed.skill.id}". Pick another id.` }, 409);
    db.prepare("INSERT INTO user_skills (id, markdown, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET markdown = excluded.markdown").run(
      parsed.skill.id,
      markdown,
      nowIso(),
    );
    return c.json({ ...parsed.skill, origin: "imported", active: activeIds().includes(parsed.skill.id) }, 201);
  });

  app.put("/api/skills/:id/active", async (c) => {
    const id = c.req.param("id");
    const { active: on } = z.object({ active: z.boolean() }).parse(await c.req.json());
    if (!all().some((s) => s.skill.id === id)) return c.json({ error: "Not found" }, 404);
    const ids = activeIds().filter((x) => x !== id);
    if (on) {
      if (ids.length >= SKILL_LIMITS.active) return c.json({ error: `Up to ${SKILL_LIMITS.active} skills can be active at once. Turn one off first.` }, 409);
      ids.push(id);
    }
    setActive(ids);
    return c.json({ active: ids });
  });

  app.delete("/api/skills/:id", (c) => {
    const id = c.req.param("id");
    if (communityIds.has(id)) return c.json({ error: "Community skills can be turned off, not deleted." }, 400);
    db.prepare("DELETE FROM user_skills WHERE id = ?").run(id);
    setActive(activeIds().filter((x) => x !== id));
    return c.body(null, 204);
  });

  return { active };
}
