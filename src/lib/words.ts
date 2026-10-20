// The sentences the pages show, kept apart from the components so they can be tested.
import type { BudgetStatus, SpendingPower } from "./book";
import { dayShort, monthName, type ISODate } from "./dates";
import { money } from "./money";

/** "After GH₵620.00 set aside for auto payments still to come this month: Monthly Susu (Mon 19), Data bundle
 * (Mon 19, Mon 26)." or "" when nothing is due. */
export function committedText(p: Pick<SpendingPower, "committed" | "committedItems">): string {
  if (!p.committed) return "";
  const when = new Map<string, string[]>();
  for (const i of p.committedItems) {
    if (!when.has(i.name)) when.set(i.name, []);
    when.get(i.name)!.push(dayShort(i.date));
  }
  return `After ${money(p.committed)} set aside for auto payments still to come this month: `
    + [...when].map(([name, days]) => `${name} (${days.join(", ")})`).join(", ") + ".";
}

export function bannerLabel(p: SpendingPower, now: ISODate): string {
  const month = monthName(now.slice(0, 7), false);
  if (p.state === "debt") return "Everyday accounts in debt";
  if (p.state === "no_budget") return `Everyday money · ${month}`;
  if (p.state === "committed") return "Everyday money · all set aside for auto payments";
  return `Total budget left · ${month}`;
}

export function bannerIsRed(p: SpendingPower): boolean {
  return ["debt", "empty", "committed", "over_budget"].includes(p.state);
}

/** A small comparison with last month, or part-way through a month, the same days of last month. */
export function changeText(cur: number, prev: number, goodWhenUp: boolean, versus: string)
  : { text: string; tone: "in" | "out" | "neutral" } {
  if (prev === 0) return { text: cur ? "New this month" : "No data yet", tone: "neutral" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { text: `Same as ${versus}`, tone: "neutral" };
  const up = pct > 0;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs ${versus}`, tone: up === goodWhenUp ? "in" : "out" };
}

export function budgetState(b: BudgetStatus): { tone: "over" | "warn" | "ok"; label: string; foot: string } {
  if (b.spent > b.limit) return { tone: "over", label: "Over", foot: `${money(b.spent - b.limit)} over` };
  if (b.pct >= 75) return { tone: "warn", label: "Near limit", foot: `${money(b.limit - b.spent)} left` };
  return { tone: "ok", label: "On track", foot: `${money(b.limit - b.spent)} left` };
}

export function entries(n: number): string {
  return `${n} entr${n === 1 ? "y" : "ies"}`;
}
