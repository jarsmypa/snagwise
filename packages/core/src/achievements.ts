/*
  Shopper profile: a friendly title, a few tags and game-style achievements, all derived from what
  the user actually did. Pure rules, no AI, so they are instant, free and explainable.
  Titles are always kind: they describe a strength, never a weakness ("Patient Watcher", not "Impulse Buyer").
*/

export type Area = "assistant" | "discover" | "skills" | "wallet" | "spending";

export interface ShopperStats {
  swipes: number; // real Discover answers
  likes: number;
  priceLikes: number; // likes where the price was (part of) the reason
  likedCategories: number; // distinct categories liked
  signals: number; // taste profile signals
  playRuns: number;
  playAllIn: number; // play runs that used ≥90% of the pretend money
  wantForReal: number; // play picks moved to the real wallet
  walletAdds: number; // items ever added to the wallet
  alerts: number; // price alerts ever raised
  purchases: number;
  savedCents: number;
  chats: number; // conversations with the agent
  handoffs: number; // times another AI model took over mid-conversation
  shares: number; // recommendation cards created
  shareOpens: number;
  shareSaves: number; // friends who saved a recommended deal
  skillsActive: number;
  skillsImported: number;
  budgetUsedShare: number; // spent ÷ budget this month (0..1+)
}

export interface AchievementDef {
  id: string;
  area: Area;
  goal: number;
  value: (s: ShopperStats) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_chat", area: "assistant", goal: 1, value: (s) => s.chats },
  { id: "relay", area: "assistant", goal: 1, value: (s) => s.handoffs },
  { id: "first_swipe", area: "discover", goal: 1, value: (s) => s.swipes },
  { id: "taste_teacher", area: "discover", goal: 25, value: (s) => s.signals },
  { id: "price_spotter", area: "discover", goal: 5, value: (s) => s.priceLikes },
  { id: "explorer", area: "discover", goal: 4, value: (s) => s.likedCategories },
  { id: "window_shopper", area: "discover", goal: 1, value: (s) => s.playRuns },
  { id: "daydreamer", area: "discover", goal: 3, value: (s) => s.playRuns },
  { id: "dream_to_plan", area: "wallet", goal: 1, value: (s) => s.wantForReal },
  { id: "first_share", area: "discover", goal: 1, value: (s) => s.shares },
  { id: "word_of_mouth", area: "discover", goal: 1, value: (s) => s.shareSaves },
  { id: "first_watch", area: "wallet", goal: 1, value: (s) => s.walletAdds },
  { id: "wish_collector", area: "wallet", goal: 5, value: (s) => s.walletAdds },
  { id: "right_on_time", area: "wallet", goal: 1, value: (s) => s.alerts },
  { id: "first_purchase", area: "spending", goal: 1, value: (s) => s.purchases },
  { id: "saved_25", area: "spending", goal: 2500, value: (s) => s.savedCents },
  { id: "saved_100", area: "spending", goal: 10000, value: (s) => s.savedCents },
  { id: "learning_from_pros", area: "skills", goal: 1, value: (s) => s.skillsActive },
];

export interface AchievementState {
  id: string;
  area: Area;
  goal: number;
  progress: number; // capped at goal
  unlocked: boolean;
}

export function achievementStates(stats: ShopperStats): AchievementState[] {
  return ACHIEVEMENTS.map((a) => {
    const value = a.value(stats);
    return { id: a.id, area: a.area, goal: a.goal, progress: Math.min(value, a.goal), unlocked: value >= a.goal };
  });
}

export type TitleId =
  | "first_steps"
  | "deal_hunter"
  | "patient_watcher"
  | "budget_keeper"
  | "trendsetter"
  | "explorer"
  | "big_dreamer"
  | "careful_saver"
  | "expert_eye";

// Each title earns points from the behaviour it describes. The best scorer is the title; the
// other qualifying ones become style tags. Thresholds keep a title from appearing on day one by accident.
export function shopperTitles(s: ShopperStats): TitleId[] {
  const scores: [TitleId, number][] = [
    ["deal_hunter", s.priceLikes >= 3 ? s.priceLikes / Math.max(s.likes, 1) + s.priceLikes / 10 : 0],
    ["patient_watcher", s.walletAdds >= 3 ? s.walletAdds / 5 + s.alerts / 3 : 0],
    ["budget_keeper", s.purchases >= 1 && s.budgetUsedShare > 0 && s.budgetUsedShare <= 0.8 ? 1 + (0.8 - s.budgetUsedShare) : 0],
    ["trendsetter", s.shareSaves >= 1 || s.shareOpens >= 3 ? 1 + s.shareSaves / 2 + s.shareOpens / 10 : 0],
    ["explorer", s.likedCategories >= 4 ? s.likedCategories / 4 : 0],
    ["big_dreamer", s.playAllIn >= 1 ? 0.8 + s.playAllIn / 3 : 0],
    ["careful_saver", s.savedCents >= 2500 ? 1 + s.savedCents / 10000 : 0],
    ["expert_eye", s.skillsActive + s.skillsImported >= 2 ? 1 + s.skillsImported / 2 : 0],
  ];
  const earned = scores.filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  return earned.length ? earned : ["first_steps"];
}
