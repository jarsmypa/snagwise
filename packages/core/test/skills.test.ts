import { describe, expect, it } from "vitest";
import { parseSkill, skillScore, SKILL_TEMPLATE, type Offer, type Skill } from "../src/index.ts";

const md = (header: string, body = "- Buy in January.") => `---\n${header}\n---\n${body}\n`;

describe("parseSkill", () => {
  it("reads the header and the tips", () => {
    const r = parseSkill(
      md("name: Gamer Deals\nid: gamer-deals\nauthor: ana\ndescription: Better game prices.\ncategories: Games, Consoles\nprefer_stores: Store-A.com, shop.b.net"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill).toMatchObject({ id: "gamer-deals", author: "ana", categories: ["Games", "Consoles"], preferStores: ["store-a.com", "shop.b.net"], avoidStores: [] });
    expect(r.skill.body).toBe("- Buy in January.");
  });

  it("accepts the template as a starting point", () => {
    expect(parseSkill(SKILL_TEMPLATE).ok).toBe(true);
  });

  it("explains what is wrong", () => {
    const r = parseSkill(md("name: X\nid: Bad Id!\ndescription: ok\nprefer_stores: not a domain"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/id must be/);
    expect(r.errors.join(" ")).toMatch(/not a store domain/);
  });

  it("rejects files without a header or with oversized tips", () => {
    expect(parseSkill("just text").ok).toBe(false);
    expect(parseSkill(md("name: X\nid: abc\ndescription: ok", "a".repeat(4001))).ok).toBe(false);
  });
});

describe("skillScore", () => {
  const skill = { preferStores: ["good.com"], avoidStores: ["bad.com"] } as Skill;
  const offer = (domain: string) => ({ domain }) as Offer;

  it("nudges preferred stores up, including subdomains, and avoided stores down", () => {
    expect(skillScore([skill], offer("shop.good.com"))).toBeGreaterThan(0);
    expect(skillScore([skill], offer("bad.com"))).toBeLessThan(0);
    expect(skillScore([skill], offer("notgood.com"))).toBe(0);
  });
});
