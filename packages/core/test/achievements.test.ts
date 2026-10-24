import { describe, expect, it } from "vitest";
import { achievementStates, ACHIEVEMENTS, categoryGroup, shopperTitles, type ShopperStats } from "../src/index.ts";

const zero: ShopperStats = {
  swipes: 0, likes: 0, priceLikes: 0, likedCategories: 0, signals: 0, playRuns: 0, playAllIn: 0, wantForReal: 0,
  walletAdds: 0, alerts: 0, purchases: 0, savedCents: 0, chats: 0, handoffs: 0, shares: 0, shareOpens: 0,
  shareSaves: 0, shareSavesByGroup: { fashion: 0, tech: 0, home: 0 }, skillsActive: 0, skillsImported: 0, budgetUsedShare: 0,
};

describe("achievements", () => {
  it("start locked with no progress", () => {
    const states = achievementStates(zero);
    expect(states).toHaveLength(ACHIEVEMENTS.length);
    expect(states.every((a) => !a.unlocked && a.progress === 0)).toBe(true);
  });

  it("unlock at the goal and cap progress", () => {
    const states = achievementStates({ ...zero, swipes: 1, savedCents: 5_000, walletAdds: 3 });
    const by = Object.fromEntries(states.map((a) => [a.id, a]));
    expect(by.first_swipe?.unlocked).toBe(true);
    expect(by.saved_25?.unlocked).toBe(true);
    expect(by.saved_100).toMatchObject({ unlocked: false, progress: 5_000, goal: 10_000 });
    expect(by.wish_collector).toMatchObject({ unlocked: false, progress: 3 });
  });

  it("have unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe("shopperTitles", () => {
  it("starts everyone on first steps", () => {
    expect(shopperTitles(zero)).toEqual(["first_steps"]);
  });

  it("names the strongest behaviour first and keeps the rest as tags", () => {
    const titles = shopperTitles({ ...zero, likes: 6, priceLikes: 5, likedCategories: 4 });
    expect(titles[0]).toBe("deal_hunter");
    expect(titles).toContain("explorer");
  });

  it("only calls someone a budget keeper after a real purchase under 80% of the budget", () => {
    expect(shopperTitles({ ...zero, budgetUsedShare: 0.5 })).not.toContain("budget_keeper");
    expect(shopperTitles({ ...zero, purchases: 1, budgetUsedShare: 0.5 })).toContain("budget_keeper");
    expect(shopperTitles({ ...zero, purchases: 1, budgetUsedShare: 0.95 })).not.toContain("budget_keeper");
  });
});

describe("sidequests", () => {
  it("move only when other people open or save your recommendations", () => {
    const by = (stats: ShopperStats) => Object.fromEntries(achievementStates(stats).map((a) => [a.id, a]));
    const quiet = by({ ...zero, shares: 3 });
    expect(quiet.deal_sharer?.unlocked).toBe(true);
    expect(quiet.fashion_advisor?.unlocked).toBe(false);
    const fashion = by({ ...zero, shareSaves: 1, shareSavesByGroup: { fashion: 1, tech: 0, home: 0 } });
    expect(fashion.fashion_advisor).toMatchObject({ unlocked: true, kind: "quest" });
    expect(fashion.tech_guide?.unlocked).toBe(false);
  });

  it("group store categories", () => {
    expect(categoryGroup("Running Sneakers")).toBe("fashion");
    expect(categoryGroup("Over-Ear Headphones")).toBe("tech");
    expect(categoryGroup("Coffee Makers")).toBe("home");
    expect(categoryGroup("Print Books")).toBeNull();
  });
});
