// The meal planner's arithmetic, kept apart from the screens: a port of meals/logic.py.
// Everything works on plain data: plan entries, recipes, recipe items, pantry {ingredient|base: qty}.
import { addDays, daysBetween, type ISODate } from "../dates";
import { fmt, frac, isLoose, packsFor, plural, toBase, type Pack } from "./units";

export const SLOTS = ["Breakfast", "Lunch", "Supper"] as const;
export type Slot = (typeof SLOTS)[number];
export const ROLES: Record<string, string> = {
  starch: "Starch (kokonte, fufu, banku, rice, yam…)", soup: "Soup", stew: "Stew", sauce: "Sauce", main: "Complete dish",
  side: "Side",
};
export const ROLE_ORDER: Record<string, number> = { starch: 0, soup: 1, stew: 1, sauce: 1, main: 2, side: 3 };
export const MEAL_HOUR: Record<string, number> = { Breakfast: 7, Lunch: 13, Supper: 19 };
export const OPEN = "planned";

export type Recipe = {
  name: string; portions: number; keepsDays: number; prepNote: string | null; prepHours: number | null;
  method?: string | null; bought?: boolean; price?: number | null; countUnit?: string; shop?: string; category?: string;
  role?: string;
};
export type Line = [number, number, string]; // ingredient, qty, unit
export type Need = [number, string, number]; // ingredient, base unit, qty
export type Entry = {
  id: number; day: ISODate; slot: string; recipeId: number | null; ingredientId: number | null; qty: number;
  unit: string | null; status: string; label?: string | null; price?: number | null; people?: number | null;
  short?: Need[]; doneBy?: string | null;
};
export type Batch = {
  id: number; recipeId: number | null; label: string; portions: number; cookedOn?: ISODate; eatBy: ISODate; unit?: string;
};
export type Recipes = Map<number, Recipe>;
export type Items = Map<number, Line[]>;
export type Stock = Map<string, number>; // "ingredient|base" -> qty
export type Packs = Map<number, Pack>;
export type Household = number | Record<string, number>;

export const sk = (ing: number, base: string) => `${ing}|${base}`;
export const unkey = (k: string): [number, string] => {
  const i = k.indexOf("|");
  return [Number(k.slice(0, i)), k.slice(i + 1)];
};

/** How many eat this meal: the number set on the meal itself, otherwise the usual for its slot. */
export function eaters(e: { people?: number | null; slot?: string }, household: Household): number {
  if (e.people) return Number(e.people);
  if (typeof household === "object") {
    const vals = Object.values(household);
    return Number(household[e.slot ?? ""] ?? (vals.length ? Math.max(...vals) : 1));
  }
  return Number(household);
}

/** Food bought ready-made (kenkey, waakye…): a bought dish, or a one-off typed into the plan. */
export function isBought(e: Pick<Entry, "recipeId" | "ingredientId" | "label">, recipes: Recipes): boolean {
  if (e.recipeId) return Boolean(recipes.get(e.recipeId)?.bought);
  return !e.ingredientId && Boolean(e.label);
}

export function boughtCost(entries: Entry[], recipes: Recipes): [number, number] {
  let total = 0;
  let unknown = 0;
  for (const e of entries) {
    if (!isBought(e, recipes)) continue;
    const price = e.price || (e.recipeId ? recipes.get(e.recipeId)?.price : null);
    if (price) total += Number(price) * e.qty;
    else unknown += 1;
  }
  return [round(total, 2), unknown];
}

/** Python's round(x, d): the exact binary value rounded to d decimals, ties to the even digit. */
export function round(x: number, d: number): number {
  const exact = Math.abs(x).toFixed(Math.min(d + 30, 100)); // every digit of the binary value
  const cut = exact.indexOf(".") + 1 + d;
  const rest = exact.slice(cut);
  if (/^50*$/.test(rest)) { // an exact tie: keep the even digit
    const kept = Number(exact.slice(0, cut).replace(/\.$/, ""));
    const last = Number(exact[cut - 1] === "." ? exact[cut - 2] : exact[cut - 1]);
    const up = last % 2 === 1;
    const v = up ? kept + 10 ** -d : kept;
    return Math.sign(x) * Number(v.toFixed(d));
  }
  return Math.sign(x) * Number(Math.abs(x).toFixed(d)) || 0;
}

/** What one plan entry uses: a recipe is scaled to the portions planned. */
export function entryNeeds(e: Pick<Entry, "recipeId" | "ingredientId" | "qty" | "unit" | "label">, recipes: Recipes,
  items: Items, packs: Packs = new Map()): Need[] {
  if (isBought(e, recipes)) return [];
  if (e.recipeId) {
    const r = recipes.get(e.recipeId);
    if (!r) return [];
    const factor = e.qty / Math.max(r.portions, 1);
    return (items.get(e.recipeId) ?? []).map(([ing, qty, unit]) => {
      const [q, base] = toBase(qty * factor, unit, packs.get(ing));
      return [ing, base, q];
    });
  }
  const [q, base] = toBase(e.qty, e.unit || "pcs", packs.get(e.ingredientId!));
  return [[e.ingredientId!, base, q]];
}

export type Total = { qty: number; for: string[]; short?: number; reason?: string };

/** Every ingredient across the entries added up: 3 onions + 3 onions = 6; 500 g + 1 kg = 1.5 kg. */
export function totalNeeds(entries: Entry[], recipes: Recipes, items: Items, nameOf?: (e: Entry) => string,
  packs?: Packs): Map<string, Total> {
  const totals = new Map<string, Total>();
  for (const e of entries) {
    const label = nameOf?.(e);
    for (const [ing, base, q] of entryNeeds(e, recipes, items, packs)) {
      const k = sk(ing, base);
      const t = totals.get(k) ?? { qty: 0, for: [] };
      t.qty += q;
      if (label && !t.for.includes(label)) t.for.push(label);
      totals.set(k, t);
    }
  }
  return totals;
}

/** An amount you can ask for at the market: 5.88 onions -> 6, 38.75 g -> 40 g, 1.625 kg -> 1.65 kg. */
export function buyable(qty: number, base: string): number {
  if (qty <= 0) return 0;
  if (base === "g" || base === "ml") {
    const step = qty < 100 ? 5 : qty < 2000 ? 50 : 100;
    return Math.ceil(qty / step - 1e-9) * step;
  }
  return Math.ceil(qty - 1e-9);
}

export type ShopRow = {
  ingredientId: number; base: string; need: number; have: number; toBuy: number; reason: string; low: boolean;
  packs: number | null; pack: string | null; buyQty: number; est: number | null;
};

/** What to buy: needed minus what's in the pantry, plus staples that are running low. */
export function shoppingList(needs: Map<string, Total>, pantry: Stock, lowLevels?: Map<string, number | null>,
  prices: Map<string, number> = new Map(), packs: Packs = new Map()): ShopRow[] {
  const out: ShopRow[] = [];
  for (const [k, n] of needs) {
    const [ing, base] = unkey(k);
    let have: number;
    let toBuy: number;
    if (n.short !== undefined) {
      have = Math.max(n.qty - n.short, 0);
      toBuy = round(Math.max(n.short, 0), 3);
    } else {
      have = pantry.get(k) ?? 0;
      toBuy = round(Math.max(n.qty - have, 0), 3);
    }
    if (toBuy <= 0) continue;
    const reason = n.reason || (n.for.length ? `For ${n.for.join(", ")}` : "");
    out.push({ ingredientId: ing, base, need: n.qty, have, toBuy, reason, low: false, packs: null, pack: null, buyQty: 0,
      est: null });
  }
  const listed = new Set(out.map((r) => sk(r.ingredientId, r.base)));
  for (const [k, level] of lowLevels ?? []) {
    if (level === null || level === undefined || listed.has(k)) continue;
    const have = pantry.get(k) ?? 0;
    if (have <= level) {
      const [ing, base] = unkey(k);
      out.push({ ingredientId: ing, base, need: 0, have, toBuy: round(Math.max(level * 2 - have, level), 3),
        reason: "Running low", low: true, packs: null, pack: null, buyQty: 0, est: null });
    }
  }
  for (const r of out) {
    const pack = packs.get(r.ingredientId);
    if (pack && pack[2] === r.base && pack[1] && !isLoose(pack)) {
      r.packs = packsFor(r.toBuy, pack);
      r.pack = pack[0];
      r.buyQty = r.packs! * pack[1];
    } else {
      r.toBuy = buyable(r.toBuy, r.base);
      r.buyQty = r.toBuy;
    }
    const per = prices.get(sk(r.ingredientId, r.base));
    r.est = per !== undefined ? round(per * r.buyQty, 2) : null;
  }
  return out;
}

// ---- sharing out the stock -----------------------------------------------------------------------------------
export function mealTime(day: ISODate, slot: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, MEAL_HOUR[slot] ?? 12);
}

function byWhen(a: Entry, b: Entry) {
  return mealTime(a.day, a.slot) - mealTime(b.day, b.slot) || (a.id ?? 0) - (b.id ?? 0);
}

export type MealState = { status: "ready" | "leftovers" | "short" | "bought"; missing: Need[]; needs: Need[] };
export type Pot = {
  recipeId: number; day: ISODate; slot: string; cooked: number; eaten: number; eatBy: ISODate; left: number;
};
export type Allocation = { meals: Map<number, MealState>; stockAfter: Stock; pots: Map<number, Pot> };

/** Share the fridge and pantry out across the planned meals, in the order they'll be eaten. Earlier meals get first
 * claim; a meal whose dish is in the fridge (enough for everyone eating) is eaten from there; cooking more than is
 * eaten puts the rest in the fridge for a later meal of the same dish before it goes off. */
export function allocate(entries: Entry[], recipes: Recipes, items: Items, pantry: Stock, fridge: Batch[],
  household: Household, today: ISODate, packs?: Packs): Allocation {
  const stock: Stock = new Map(pantry);
  // each box: [recipe, portions left, eat by, the plan entry that cooked it (null: in the fridge)]
  const boxes: [number, number, ISODate, number | null][] = fridge
    .filter((b) => b.recipeId && b.portions > 0).map((b) => [b.recipeId!, b.portions, b.eatBy, null]);
  const meals = new Map<number, MealState>();
  const pots = new Map<number, Pot>();
  const open = entries.filter((e) => e.status === OPEN && e.day >= today).sort(byWhen);
  for (const e of open) {
    const rid = e.recipeId;
    const recipe = rid ? recipes.get(rid) : undefined;
    if (isBought(e, recipes)) {
      meals.set(e.id, { status: "bought", missing: [], needs: [] });
      continue;
    }
    const people = eaters(e, household);
    if (recipe && rid) {
      const eat = Math.min(people, e.qty);
      const ready = boxes.filter((b) => b[0] === rid && b[1] > 1e-9 && b[2] >= e.day)
        .sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
      if (eat > 0 && ready.reduce((a, b) => a + b[1], 0) >= eat - 1e-9) {
        let left = eat;
        for (const b of ready) {
          const t = Math.min(b[1], left);
          b[1] -= t;
          left -= t;
          if (b[3] !== null) pots.get(b[3])!.eaten += t;
        }
        meals.set(e.id, { status: "leftovers", missing: [], needs: [] });
        continue;
      }
    }
    const needs = entryNeeds(e, recipes, items, packs);
    const missing: Need[] = [];
    for (const [ing, base, q] of needs) {
      const k = sk(ing, base);
      const have = stock.get(k) ?? 0;
      const used = Math.min(have, q);
      stock.set(k, have - used);
      if (q - used > 1e-6) missing.push([ing, base, q - used]);
    }
    if (recipe && rid) {
      const eatenNow = Math.min(people, e.qty);
      const extra = e.qty - eatenNow;
      if (extra > 1e-9) {
        const eatBy = addDays(e.day, Math.trunc(recipe.keepsDays || 3));
        boxes.push([rid, extra, eatBy, e.id]);
        pots.set(e.id, { recipeId: rid, day: e.day, slot: e.slot, cooked: e.qty, eaten: eatenNow, eatBy, left: 0 });
      }
    }
    meals.set(e.id, { status: missing.length ? "short" : "ready", missing, needs });
  }
  for (const p of pots.values()) p.left = round(p.cooked - p.eaten, 3);
  return { meals, stockAfter: stock, pots };
}

/** Planned pots that will partly go off, judged only when their eat-by date falls inside the planned window. */
export function potWaste(alloc: Allocation, until: ISODate, atLeast = 1): (Pot & { entryId: number })[] {
  return [...alloc.pots].filter(([, p]) => p.eatBy <= until && p.left >= atLeast - 1e-9)
    .map(([k, p]) => ({ ...p, entryId: k }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (MEAL_HOUR[a.slot] ?? 12) - (MEAL_HOUR[b.slot] ?? 12)));
}

/** How many portions to cook so nothing goes off: what's eaten before the eat-by date, to the half. */
export function suggestedPot(p: Pick<Pot, "eaten">): number {
  return Math.max(Math.ceil(p.eaten * 2 - 1e-9) / 2, 0.5);
}

export type NewEntry = Omit<Entry, "id" | "status"> & { status?: string };

/** Fill empty meals in the next `horizon` days with whatever was planned 7 days earlier, day by day. */
export function repeatPlan(plan: Entry[], today: ISODate, horizon = 14): NewEntry[] {
  const bySlot = new Map<string, (Entry | NewEntry)[]>();
  const first = addDays(today, -7);
  const last = addDays(today, horizon - 1);
  for (const e of plan) {
    if (e.day >= first && e.day <= last) {
      const k = `${e.day}|${e.slot}`;
      bySlot.set(k, [...(bySlot.get(k) ?? []), e]);
    }
  }
  const out: NewEntry[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = addDays(today, i);
    for (const slot of SLOTS) {
      if (bySlot.get(`${d}|${slot}`)?.length) continue;
      const src = bySlot.get(`${addDays(d, -7)}|${slot}`);
      if (src?.length) {
        const copies = src.map((e) => ({ day: d, slot, recipeId: e.recipeId ?? null, ingredientId: e.ingredientId ?? null,
          qty: e.qty, unit: e.unit ?? null, label: e.label ?? null, price: e.price ?? null, people: e.people ?? null }));
        bySlot.set(`${d}|${slot}`, copies);
        out.push(...copies);
      }
    }
  }
  return out;
}

/** What the given meals still need after the stock is shared out, in the shape shoppingList() takes. */
export function shortfall(alloc: Allocation, entries: Entry[], nameOf?: (e: Entry) => string): Map<string, Total> {
  const totals = new Map<string, Total>();
  for (const e of entries) {
    const m = alloc.meals.get(e.id);
    if (!m) continue;
    const missing = new Map<string, number>();
    for (const [ing, base, q] of m.missing) missing.set(sk(ing, base), (missing.get(sk(ing, base)) ?? 0) + q);
    const label = nameOf?.(e);
    for (const [ing, base, q] of m.needs) {
      const k = sk(ing, base);
      const t = totals.get(k) ?? { qty: 0, short: 0, for: [] };
      t.qty += q;
      if (missing.get(k)) {
        t.short! += missing.get(k)!;
        missing.delete(k);
        if (label && !t.for.includes(label)) t.for.push(label);
      }
      totals.set(k, t);
    }
  }
  return new Map([...totals].filter(([, v]) => (v.short ?? 0) > 1e-6));
}

/** Warn before the shopping, not after. planned: estimated cost of what still needs buying this month. */
export function budgetGuard(limit: number, spent: number, planned: number, what = "food")
  : { level: "75" | "90" | "will_go_over" | "over"; text: string } | null {
  if (!limit || limit <= 0) return null;
  const gh = (x: number) => `GH₵${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const after = spent + (planned || 0);
  const What = what[0].toUpperCase() + what.slice(1);
  if (spent > limit) return { level: "over", text: `${What} spending is ${gh(spent - limit)} over this month's ${gh(limit)} budget.` };
  if (after > limit) {
    const swap = what === "food" ? " Consider swapping a dish." : "";
    return { level: "will_go_over", text: `The planned shopping (about ${gh(planned)}) would take ${what} spending to `
      + `${gh(after)}, ${gh(after - limit)} over the ${gh(limit)} budget.${swap}` };
  }
  const pct = (after / limit) * 100;
  if (pct >= 75) {
    return { level: pct >= 90 ? "90" : "75", text: `With the planned shopping, ${what} spending reaches ${pct.toFixed(0)}% `
      + `of the ${gh(limit)} budget (${gh(limit - after)} left).` };
  }
  return null;
}

// ---- money -----------------------------------------------------------------------------------------------------
export function costOf(needs: Map<string, Total>, prices: Map<string, number>): [number, number] {
  let total = 0;
  let unknown = 0;
  for (const [k, n] of needs) {
    const per = prices.get(k);
    if (per === undefined) unknown += 1;
    else total += per * n.qty;
  }
  return [round(total, 2), unknown];
}

/** [cost of one batch, cost per portion, ingredients with no price yet] */
export function recipeCost(rid: number, recipes: Recipes, items: Items, prices: Map<string, number>, packs?: Packs)
  : [number, number, number] {
  const r = recipes.get(rid);
  if (!r) return [0, 0, 0];
  const needs = new Map<string, Total>();
  for (const [ing, base, q] of entryNeeds({ recipeId: rid, ingredientId: null, qty: r.portions, unit: null }, recipes,
    items, packs)) {
    const t = needs.get(sk(ing, base)) ?? { qty: 0, for: [] };
    t.qty += q;
    needs.set(sk(ing, base), t);
  }
  const [total, unknown] = costOf(needs, prices);
  return [total, round(total / Math.max(r.portions, 1), 2), unknown];
}

export type TripLine = { ingredientId: number | null; name: string; qty: number; base: string; price: number; category: string };

/** Big price moves since last time: [name, old per unit, new per unit, change as a fraction]. */
export function priceChanges(lines: TripLine[], old: Map<string, number>, threshold = 0.2): [string, number, number, number][] {
  const out: [string, number, number, number][] = [];
  for (const ln of lines) {
    if (!ln.ingredientId || !ln.qty || !ln.price) continue;
    const before = old.get(sk(ln.ingredientId, ln.base));
    if (!before) continue;
    const now = ln.price / ln.qty;
    const change = (now - before) / before;
    if (Math.abs(change) >= threshold) out.push([ln.name, before, now, change]);
  }
  return out.sort((a, b) => Math.abs(b[3]) - Math.abs(a[3]));
}

// ---- what to cook ----------------------------------------------------------------------------------------------
/** Dishes worth planning next: eat up leftovers, use what's in the pantry, and don't repeat what was had recently. */
export function suggest(recipes: Recipes, items: Items, pantry: Stock, fridge: Batch[], recent: Entry[], today: ISODate,
  packs?: Packs, limit = 3): { recipeId: number; score: number; reasons: string[] }[] {
  const lastHad = new Map<number, ISODate>();
  for (const e of recent) {
    if (e.recipeId && e.day <= today) {
      const was = lastHad.get(e.recipeId);
      lastHad.set(e.recipeId, was && was > e.day ? was : e.day);
    }
  }
  const ahead = new Set(recent.filter((e) => e.recipeId && e.day > today).map((e) => e.recipeId!));
  const leftover = new Map<number, number>();
  for (const b of fridge) {
    if (b.recipeId && b.eatBy >= today && b.portions > 0) leftover.set(b.recipeId, (leftover.get(b.recipeId) ?? 0) + b.portions);
  }
  const out: { recipeId: number; score: number; reasons: string[] }[] = [];
  for (const [rid, r] of recipes) {
    if (ahead.has(rid)) continue;
    let score = 0;
    const reasons: string[] = [];
    if (leftover.get(rid)) {
      score += 5;
      reasons.push(`${pyG(leftover.get(rid)!)} portions already in the fridge`);
    }
    const lines = entryNeeds({ recipeId: rid, ingredientId: null, qty: r.portions, unit: null }, recipes, items, packs);
    if (lines.length) {
      const covered = lines.filter(([ing, base, q]) => (pantry.get(sk(ing, base)) ?? 0) >= q - 1e-9).length;
      score += (3 * covered) / lines.length;
      if (covered === lines.length) reasons.push("everything is in the pantry");
      else if (covered) reasons.push(`${covered} of ${lines.length} ingredients in the pantry`);
    }
    const had = lastHad.get(rid);
    const days = had ? daysBetween(had, today) : null;
    if (days === null) {
      score += 1.5;
      reasons.push("not had in the last few weeks");
    } else if (days < 4) score -= 3;
    else {
      score += Math.min(days, 14) / 7;
      reasons.push(`last had ${days} days ago`);
    }
    out.push({ recipeId: rid, score: round(score, 2), reasons });
  }
  out.sort((a, b) => b.score - a.score || cmp(recipes.get(a.recipeId)!.name, recipes.get(b.recipeId)!.name));
  return out.filter((x) => x.score > 0).slice(0, limit);
}

/** Python's string order (by code point), not the locale's. */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Python's f"{x:g}" for the numbers the app shows: 3.0 -> "3", 2.5 -> "2.5". */
export function pyG(x: number): string {
  return String(Number(x.toPrecision(6)));
}

/** Take portions from fridge batches, oldest eat-by first: [[batch, portions taken]], portions still missing. */
export function takePortions(batches: { id: number; portions: number; eatBy: ISODate }[], wanted: number)
  : [[number, number][], number] {
  const taken: [number, number][] = [];
  let left = wanted;
  for (const b of [...batches].sort((x, y) => (x.eatBy < y.eatBy ? -1 : x.eatBy > y.eatBy ? 1 : x.id - y.id))) {
    if (left <= 0) break;
    const t = Math.min(b.portions, left);
    if (t > 0) {
      taken.push([b.id, t]);
      left -= t;
    }
  }
  return [taken, Math.max(left, 0)];
}

export function fridgeFlag(b: Pick<Batch, "eatBy" | "portions">, today: ISODate, lowPortions = 1): "past" | "soon" | "low" | null {
  if (b.eatBy < today) return "past";
  if (b.eatBy <= addDays(today, 1)) return "soon";
  if (b.portions <= lowPortions) return "low";
  return null;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon 21:00" from a time in ms (Accra time is UTC) */
function dayTime(ms: number): string {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
/** "Mon 19 Oct" */
export function aDb(iso: ISODate): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MO[d.getUTCMonth()]}`;
}
/** "Mon 19" */
export function aD(iso: ISODate): string {
  return aDb(iso).slice(0, 6);
}

export type Note = [tone: "warn" | "info" | "ok", text: string, kind: string];

/** Things that affect cooking in the next day or so, most urgent first. now: ms (Accra time is UTC). */
export function reminders(now: number, entries: Entry[], recipes: Recipes, items: Items, pantry: Stock, fridge: Batch[],
  names: Map<number, string>, household: Household, opts: { lowPortions?: number; packs?: Packs; alloc?: Allocation;
    lowLevels?: Map<string, number | null>; usual?: Map<number, string> } = {}): Note[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const out: Note[] = [];
  const open = entries.filter((e) => e.status === OPEN && e.day >= today).sort(byWhen);
  const alloc = opts.alloc ?? allocate(open, recipes, items, pantry, fridge, household, today, opts.packs);
  const status = alloc.meals;

  // prep that needs doing ahead (soak beans, defrost fish)
  for (const e of open) {
    const r = e.recipeId ? recipes.get(e.recipeId) : undefined;
    if (!r || !r.prepNote || !r.prepHours || status.get(e.id)?.status === "leftovers") continue;
    const at = mealTime(e.day, e.slot);
    const start = at - Math.trunc(r.prepHours) * 3_600_000;
    if (start <= now + 12 * 3_600_000 && now < at) {
      const when = start <= now ? "now" : `by ${dayTime(start)}`;
      const dayWord = e.day === today ? "today's" : "tomorrow's";
      out.push([start <= now ? "warn" : "info", `${r.prepNote} ${when} for ${dayWord} ${e.slot.toLowerCase()} (${r.name}).`, "prep"]);
    }
  }
  // leftovers in the fridge that cover a planned meal: one line per day, each dish once
  const inFridge = new Map<number, number>();
  for (const b of fridge) if (b.recipeId && b.eatBy >= today) inFridge.set(b.recipeId, (inFridge.get(b.recipeId) ?? 0) + b.portions);
  const fromFridge = new Map<ISODate, string[]>();
  for (const e of open) {
    if (status.get(e.id)?.status === "leftovers" && e.recipeId && inFridge.get(e.recipeId)) {
      const name = recipes.get(e.recipeId)!.name;
      const list = fromFridge.get(e.day) ?? [];
      if (!list.includes(name)) list.push(name);
      fromFridge.set(e.day, list);
    }
  }
  for (const [day, dishes] of [...fromFridge].sort((a, b) => cmp(a[0], b[0]))) {
    out.push(["ok", `${day === today ? "Today" : "Tomorrow"}, from the fridge: ${dishes.join(", ")}. No cooking needed.`, "leftovers"]);
  }
  // bought food to pick up
  for (const e of open) {
    if (status.get(e.id)?.status !== "bought") continue;
    const r = (e.recipeId ? recipes.get(e.recipeId) : undefined) ?? ({} as Partial<Recipe>);
    const name = r.name || e.label || "food";
    const unit = r.countUnit || e.unit || "portion";
    const price = e.price || r.price;
    const cost = price ? ` (about GH₵${(Number(price) * e.qty).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "";
    const where = r.shop ? ` from ${r.shop}` : "";
    const dayWord = e.day === today ? "today's" : "tomorrow's";
    out.push(["info", `Pick up ${frac(e.qty)} ${plural(unit, e.qty)} of ${name}${where} for ${dayWord} ${e.slot.toLowerCase()}${cost}.`, "pickup"]);
  }
  // ingredients missing for today's and tomorrow's cooking
  const missing = new Map<string, number>();
  for (const e of open) for (const [ing, base, q] of status.get(e.id)?.missing ?? []) missing.set(sk(ing, base), (missing.get(sk(ing, base)) ?? 0) + q);
  if (missing.size) {
    const rows = [...missing];
    const usual = opts.usual ?? new Map();
    const listed = rows.slice(0, 6).map(([k, q]) => {
      const [ing, base] = unkey(k);
      return `${fmt(q, base, usual.get(ing))} ${names.get(ing) ?? "?"}`.replace(" pcs", "");
    }).join(", ");
    const more = rows.length > 6 ? ` and ${rows.length - 6} more` : "";
    out.push(["warn", `Buy before cooking: ${listed}${more}.`, "missing"]);
  }
  // fridge food going off or running low
  for (const b of [...fridge].sort((x, y) => cmp(x.eatBy, y.eatBy))) {
    const flag = fridgeFlag(b, today, opts.lowPortions ?? 1);
    const unit = b.unit || "portion";
    if (flag === "past") out.push(["warn", `${b.label} in the fridge was due by ${aDb(b.eatBy)}. Check it before eating.`, "past"]);
    else if (flag === "soon") {
      out.push(["warn", `Eat the ${frac(b.portions)} ${plural(unit, b.portions)} of ${b.label} by ${b.eatBy === today ? "today" : "tomorrow"}.`, "eat_soon"]);
    } else if (flag === "low") {
      out.push(["info", `Only ${frac(b.portions)} ${plural(unit, b.portions)} of ${b.label} left in the fridge.`, "low_portions"]);
    }
  }
  // staples running low (only when asked)
  if (opts.lowLevels?.size) {
    const low = [...opts.lowLevels].filter(([k, level]) => level !== null && level !== undefined && (pantry.get(k) ?? 0) <= level)
      .map(([k]) => names.get(unkey(k)[0]) ?? "?").sort(cmp);
    if (low.length) out.push(["info", `Running low: ${low.slice(0, 6).join(", ")}${low.length > 6 ? ` and ${low.length - 6} more` : ""}.`, "low_stock"]);
  }
  const order = { warn: 0, info: 1, ok: 2 };
  return out.map((n, i) => ({ n, i })).sort((a, b) => order[a.n[0]] - order[b.n[0]] || a.i - b.i).map((x) => x.n);
}

/** Would a dish planned on this day and meal be eaten from leftovers (the fridge, or a bigger pot cooked earlier)? */
export function fromLeftovers(entries: Entry[], recipes: Recipes, items: Items, pantry: Stock, fridge: Batch[],
  household: Household, today: ISODate, day: ISODate, slot: string, recipeId: number, packs?: Packs): boolean {
  const people = eaters({ slot }, household);
  const probe: Entry = { id: -1, day, slot, recipeId, ingredientId: null, qty: people, unit: null, people, status: OPEN };
  const alloc = allocate([...entries, probe], recipes, items, pantry, fridge, household, today, packs);
  return alloc.meals.get(-1)?.status === "leftovers";
}

/** One status for a meal from its dishes' statuses. */
export function mealStatus(parts: [string, string[]][]): "done" | "short" | "leftovers" | "bought" | "ready" {
  const open = parts.filter(([s]) => s !== "done");
  if (!open.length) return "done";
  const kinds = new Set(open.map(([s]) => s));
  if (kinds.has("short")) return "short";
  if (kinds.size === 1 && kinds.has("leftovers")) return "leftovers";
  if (kinds.size === 1 && kinds.has("bought")) return "bought";
  return "ready";
}
