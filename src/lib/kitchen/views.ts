// What the meal plan shows for each day and meal, worked out on the server from the Kitchen (meals/pages/plan.py).
// Plain objects only, so they can go to the browser.
import { addDays, type ISODate } from "../dates";
import { entryStatus, mealStateOf, type Kitchen, type Status } from "./kitchen";
import { OPEN, SLOTS, type Entry } from "./logic";
import { fmt, frac, plural, toBase } from "./units";

const DONE_LABEL: Record<string, string> = { cooked: "Cooked", from_fridge: "From the fridge", done: "Eaten", bought: "Bought" };
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function longDay(d: ISODate): string {
  const x = new Date(`${d}T00:00:00Z`);
  return `${WD[x.getUTCDay()]} ${String(x.getUTCDate()).padStart(2, "0")} ${MO[x.getUTCMonth()]}`;
}

export function peopleText(n: number): string {
  return `${frac(n)} ${Math.abs(n - 1) < 1e-9 ? "person" : "people"}`;
}

/** "2 portions", "1½ balls", "1.5 kg", "½ crate" */
export function detail(k: Kitchen, e: Entry): string {
  if (k.isBought(e)) {
    const [, unit] = k.boughtPrice(e);
    return `${frac(e.qty)} ${plural(unit, e.qty)}`;
  }
  if (e.recipeId) return `${frac(e.qty)} ${plural("portion", e.qty)}`;
  const [q, base] = toBase(e.qty, e.unit || "pcs");
  return fmt(q, base, e.unit);
}

export type DishView = {
  id: number; name: string; detail: string; done: boolean; doneLabel: string; kind: "recipe" | "item" | "bought";
  tag: string; fridgeHave: number; note: string; fromFridge: boolean; open: boolean;
};
export type MealView = {
  day: ISODate; slot: string; head: string; people: number; usual: number; canChangePeople: boolean; name: string;
  multi: boolean; tag: string; who: string; done: boolean; homeIds: number[]; allIds: number[]; boughtOpen: number[];
  homeDone: boolean; brief: string; dishes: DishView[]; expected: number | null;
};
export type DayView = { day: ISODate; title: string; tag: "Today" | "Tomorrow" | null; meals: MealView[] };

function dishView(k: Kitchen, e: Entry, today: ISODate): DishView {
  const bought = k.isBought(e);
  const kind = bought ? "bought" : e.recipeId ? "recipe" : "item";
  const done = e.status !== OPEN;
  let tag = "";
  if (!done && e.day >= today) {
    const [status, label] = entryStatus(k, e, today);
    const short = k.mealState(e.id, today)?.missing.length ?? 0;
    tag = bought ? `🛍️ ${label}` : ({ ready: "✅", leftovers: "🥡 fridge", short: `🛒 ${short} to buy` } as Record<string, string>)[status] ?? "";
  }
  // one dish of a meal, in a few words: "Palm nut soup 14 portions (12 into the fridge) 🥡"
  let note = `${k.entryName(e)} ${detail(k, e)}`;
  if (done) note += ` (${(DONE_LABEL[e.status] ?? "done").toLowerCase()})`;
  else {
    if (e.recipeId && !bought) {
      const extra = e.qty - Math.min(k.people(e), e.qty);
      if (extra > 1e-9) note += ` (${frac(extra)} into the fridge)`;
    }
    if (e.day >= today) {
      const [status, label] = entryStatus(k, e, today);
      note += ({ leftovers: " 🥡", short: ` 🛒 ${label}`, bought: " 🛍️" } as Record<string, string>)[status] ?? "";
    }
  }
  return { id: e.id, name: k.entryName(e), detail: detail(k, e), done, doneLabel: DONE_LABEL[e.status] ?? "Done", kind, tag,
    fridgeHave: !done && kind === "recipe" && e.recipeId ? k.fridgePortions(e.recipeId, today) : 0, note,
    fromFridge: !done && e.day >= today && k.mealState(e.id, today)?.status === "leftovers", open: !done };
}

export function mealView(k: Kitchen, parts: Entry[], today: ISODate): MealView {
  const sorted = k.sortParts(parts);
  const { day, slot } = parts[0];
  const n = k.mealPeople(day, slot);
  const usual = Number(k.slotPeople[slot] ?? k.household);
  const own = parts.some((e) => e.people);
  const done = parts.every((e) => e.status !== OPEN);
  const home = parts.filter((e) => !k.isBought(e));
  const boughtOpen = parts.filter((e) => k.isBought(e) && e.status === OPEN);
  let tag = done ? "· Done" : "";
  if (day >= today && !done) {
    const [status] = mealStateOf(k, parts, today);
    const missing = new Set(parts.flatMap((e) => (k.mealState(e.id, today)?.missing ?? []).map(([ing]) => ing)));
    tag = ({ ready: "✅", leftovers: "🥡 fridge", short: `🛒 ${missing.size} to buy`, bought: "🛍️" } as Record<Status, string>)[status] ?? "";
  }
  let expected = 0;
  let known = boughtOpen.length > 0;
  for (const e of boughtOpen) {
    const [price] = k.boughtPrice(e);
    known &&= Boolean(price);
    expected += (price ?? 0) * e.qty;
  }
  const brief = sorted.map((e) => `${k.entryName(e)} ${detail(k, e)}`
    + (e.status === OPEN && e.day >= today && k.mealState(e.id, today)?.status === "leftovers" ? " from the fridge" : "")).join(" · ");
  return {
    day, slot, head: `${slot} · ${peopleText(n)}${own ? " (not the usual)" : ""}`, people: n, usual,
    canChangePeople: day >= today && !done, name: k.mealName(parts), multi: parts.length > 1, tag, who: peopleText(n), done,
    homeIds: home.map((e) => e.id), allIds: parts.map((e) => e.id), boughtOpen: boughtOpen.map((e) => e.id),
    homeDone: home.length > 0 && home.every((e) => e.status !== OPEN), brief, dishes: sorted.map((e) => dishView(k, e, today)),
    expected: known ? Math.round(expected * 100) / 100 : null,
  };
}

export function dayView(k: Kitchen, day: ISODate, today: ISODate): DayView {
  const entries = k.entries(day);
  return {
    day, title: longDay(day), tag: day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : null,
    meals: SLOTS.map((slot) => entries.filter((e) => e.slot === slot)).filter((p) => p.length).map((p) => mealView(k, p, today)),
  };
}
