// Everything the kitchen screens ask of the data: a port of meals/data.py (Kitchen) and the parts of
// meals/briefing.py the screens use (each meal's status, the Today summary, the budget guard).
import type { Book } from "../book";
import { addDays, monthEnd, monthOf, today as todayISO, type ISODate } from "../dates";
import { money as gh } from "../money";
import {
  aD, allocate, budgetGuard, boughtCost, cmp, eaters, mealStatus, OPEN, potWaste, reminders, ROLE_ORDER, shoppingList,
  shortfall, sk, SLOTS, suggestedPot, unkey,
  type Allocation, type Batch, type Entry, type Items, type Need, type Note, type Packs, type Recipe, type Recipes,
  type Stock,
} from "./logic";
import { baseOf, fmt, fmtStock, frac, makePack, plural, toBase, type Pack } from "./units";

export const HOUSEHOLD_KEY = "meals_household";
export const slotKey = (slot: string) => `meals_people_${slot.toLowerCase()}`;
export const fmtPortions = (n: number) => `${frac(n)} ${plural("portion", n)}`;
export const STATUS_ICON: Record<string, string> = { ready: "✅", leftovers: "🥡", short: "🛒", done: "✔️", bought: "🛍️" };

export type IngredientRow = {
  id: number; name: string; unit: string; category: string | null; lowLevel: number | null; packName: string | null;
  packSize: number | null; kind: string; loose: boolean; altUnits: unknown; section: string | null;
};
export type RecipeRow = Recipe & { id: number };
export type TripRow = { id: number; date: ISODate; account: string; total: number; createdBy: string | null; shop: string | null; items: number };
export type HistoryRow = { ingredientId: number; unit: string; qty: number; price: number; date: ISODate; shop: string | null; tripId: number; perUnit: number };
export type BoughtRow = { date: ISODate; recipeId: number | null; label: string; qty: number; unit: string; paid: number; shop: string | null };
export type WasteRow = { id: number; date: ISODate; label: string; amount: number; unit: string; value: number | null; recipeId: number | null };
export type Part = { recipeId?: number; ingredientId?: number; qty?: number; unit?: string };

export type KitchenData = {
  ingredients: IngredientRow[]; recipes: RecipeRow[];
  items: { recipeId: number; ingredientId: number; qty: number; unit: string }[];
  pairings: { id: number; name: string }[];
  pairingItems: { pairingId: number; recipeId: number | null; ingredientId: number | null; qty: number | null; unit: string | null }[];
  plan: Entry[]; fridge: Batch[];
  pantry: { ingredientId: number; unit: string; qty: number }[];
  prices: { ingredientId: number; unit: string; perUnit: number }[];
  trips: TripRow[]; history: Omit<HistoryRow, "perUnit">[]; bought: BoughtRow[]; waste: WasteRow[];
  settings: Record<string, string>;
};

export class Kitchen {
  static HORIZON = 14;
  static RAN_SHORT_DAYS = 7;
  readonly ingredients: IngredientRow[];
  readonly names = new Map<number, string>();
  readonly unitOf = new Map<number, string>();
  readonly categoryOf = new Map<number, string>();
  readonly supplies = new Set<number>();
  readonly foodNames = new Map<number, string>();
  readonly foodCategories = new Set<string>();
  readonly supplyCategories = new Set<string>();
  readonly packs: Packs = new Map();
  readonly recipes: Recipes = new Map();
  readonly items: Items = new Map();
  readonly pairings = new Map<number, { name: string; parts: Part[] }>();
  readonly plan: Entry[];
  readonly fridge: Batch[];
  readonly pantry: Stock = new Map();
  readonly prices = new Map<string, number>();
  readonly lowLevels = new Map<string, number>();
  readonly trips: TripRow[];
  readonly history: HistoryRow[];
  readonly waste: WasteRow[];
  readonly boughtHistory: BoughtRow[];
  readonly household: number;
  readonly slotPeople: Record<string, number> = {};
  private byDay = new Map<ISODate, Entry[]>();
  private allocs = new Map<ISODate, Allocation>();

  constructor(f: KitchenData) {
    this.ingredients = [...f.ingredients].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
    for (const i of this.ingredients) {
      this.names.set(i.id, i.name);
      this.unitOf.set(i.id, i.unit);
      if (i.category) this.categoryOf.set(i.id, i.category);
      if (i.kind === "household") this.supplies.add(i.id);
      const pack = makePack(i.unit, i.packName, i.packSize, i.loose, i.altUnits);
      if (pack) this.packs.set(i.id, pack);
    }
    for (const [i, n] of this.names) if (!this.supplies.has(i)) this.foodNames.set(i, n);
    for (const [i, c] of this.categoryOf) (this.supplies.has(i) ? this.supplyCategories : this.foodCategories).add(c);
    for (const r of [...f.recipes].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()))) {
      this.recipes.set(r.id, { name: r.name, portions: r.portions, keepsDays: Math.trunc(r.keepsDays), prepNote: r.prepNote,
        prepHours: r.prepHours === null ? null : Math.trunc(r.prepHours), method: r.method, bought: Boolean(r.bought),
        price: r.price ?? null, countUnit: r.countUnit || "portion", shop: r.shop || "", category: r.category || "",
        role: r.role || "main" });
    }
    for (const r of this.recipes.values()) if (r.bought && r.category) this.foodCategories.add(r.category);
    for (const it of f.items) {
      const list = this.items.get(it.recipeId) ?? [];
      list.push([it.ingredientId, it.qty, it.unit]);
      this.items.set(it.recipeId, list);
    }
    for (const p of [...f.pairings].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()))) {
      this.pairings.set(p.id, { name: p.name, parts: [] });
    }
    for (const it of f.pairingItems) {
      const p = this.pairings.get(it.pairingId);
      if (!p) continue;
      if (it.recipeId && this.recipes.has(it.recipeId)) p.parts.push({ recipeId: it.recipeId });
      else if (it.ingredientId && this.names.has(it.ingredientId)) {
        p.parts.push({ ingredientId: it.ingredientId, qty: it.qty || 1, unit: it.unit || this.unitOf.get(it.ingredientId) || "pcs" });
      }
    }
    for (const [i, p] of [...this.pairings]) if (p.parts.length < 2) this.pairings.delete(i); // a pairing pairs things
    this.plan = [...f.plan].sort((a, b) => cmp(a.day, b.day) || a.id - b.id);
    for (const e of this.plan) this.byDay.set(e.day, [...(this.byDay.get(e.day) ?? []), e]);
    this.fridge = f.fridge.filter((b) => b.portions > 0).sort((a, b) => cmp(a.eatBy, b.eatBy) || a.id - b.id);
    for (const p of f.pantry) this.pantry.set(sk(p.ingredientId, p.unit), p.qty);
    for (const p of f.prices) this.prices.set(sk(p.ingredientId, p.unit), p.perUnit);
    for (const i of this.ingredients) if (i.lowLevel !== null && i.lowLevel !== undefined) this.lowLevels.set(sk(i.id, baseOf(i.unit)), i.lowLevel);
    this.trips = [...f.trips].sort((a, b) => cmp(b.date, a.date) || b.id - a.id);
    this.history = f.history.map((h) => ({ ...h, perUnit: h.price / h.qty }))
      .sort((a, b) => cmp(a.date, b.date) || a.tripId - b.tripId);
    this.waste = [...f.waste].sort((a, b) => cmp(b.date, a.date) || b.id - a.id);
    this.boughtHistory = [...f.bought].sort((a, b) => cmp(a.date, b.date));
    const hh = Number.parseInt(f.settings[HOUSEHOLD_KEY] ?? "4", 10);
    this.household = Number.isNaN(hh) ? 4 : Math.max(hh, 1);
    for (const slot of SLOTS) {
      const n = Number.parseInt(f.settings[slotKey(slot)] ?? String(this.household), 10);
      this.slotPeople[slot] = Number.isNaN(n) ? this.household : Math.max(n, 0);
    }
  }

  // ---- the next two weeks, worked out once per request --------------------------------------------------------
  window(today: ISODate = todayISO()): [ISODate, ISODate] {
    return [today, addDays(today, Kitchen.HORIZON - 1)];
  }

  allocation(today: ISODate = todayISO()): Allocation {
    if (!this.allocs.has(today)) {
      const [start, end] = this.window(today);
      this.allocs.set(today, allocate(this.openEntries(start, end), this.recipes, this.items, this.pantry, this.fridge,
        this.slotPeople, today, this.packs));
    }
    return this.allocs.get(today)!;
  }

  mealState(entryId: number, today?: ISODate) {
    return this.allocation(today).meals.get(entryId);
  }

  // ---- people per meal ----------------------------------------------------------------------------------------
  people(e: Pick<Entry, "people" | "slot">): number {
    return eaters(e, this.slotPeople);
  }

  mealPeople(day: ISODate, slot: string): number {
    const parts = (this.byDay.get(day) ?? []).filter((x) => x.slot === slot && x.people);
    return parts.length ? Number(parts[0].people) : Number(this.slotPeople[slot] ?? this.household);
  }

  // ---- pots that will partly go off ---------------------------------------------------------------------------
  potWarnings(today: ISODate = todayISO()) {
    const [, end] = this.window(today);
    return potWaste(this.allocation(today), end).map((p) => {
      const name = this.recipes.get(p.recipeId)?.name ?? "?";
      const n = suggestedPot(p);
      return { ...p, name, suggest: n,
        text: `${name} on ${aD(p.day)}: cook ${fmtPortions(n)}, not ${fmtPortions(p.cooked)}. The rest would go off by ${aD(p.eatBy)}.` };
    });
  }

  // ---- ingredients that ran out while cooking -------------------------------------------------------------------
  ranShort(today: ISODate = todayISO()) {
    const out = new Map<string, { qty: number; short: number; for: string[]; mismatch: string | null }>();
    for (const e of this.entries(addDays(today, -Kitchen.RAN_SHORT_DAYS), today)) {
      if (e.status === OPEN) continue;
      for (const [ingRaw, base, qRaw] of e.short ?? []) {
        const ing = Number(ingRaw);
        const q = Number(qRaw);
        if (this.supplies.has(ing) || !this.names.has(ing)) continue;
        if ((this.pantry.get(sk(ing, base)) ?? 0) >= q - 1e-9) continue; // bought since, or corrected
        const t = out.get(sk(ing, base)) ?? { qty: 0, short: 0, for: [], mismatch: null };
        t.qty += q;
        t.short += q;
        const meal = this.mealNameOf(e);
        if (!t.for.includes(meal)) t.for.push(meal);
        // stock kept in another unit (cups) than the recipe asks for (grams) can't be taken off
        const other = [...this.pantry].filter(([k, v]) => unkey(k)[0] === ing && unkey(k)[1] !== base && v > 0);
        if (other.length) t.mismatch = unkey(other[0][0])[1];
        out.set(sk(ing, base), t);
      }
    }
    return out;
  }

  private ranShortNotes(today: ISODate): Note[] {
    const notes: Note[] = [];
    const short = [...this.ranShort(today)];
    const plain = short.filter(([, t]) => !t.mismatch);
    if (plain.length) {
      const items = plain.map(([k, t]) => {
        const [ing, base] = unkey(k);
        return `${fmt(t.short, base, this.unitOf.get(ing))} ${this.names.get(ing)}`.replace(" pcs", "");
      }).join(", ");
      notes.push(["warn", `Ran out while cooking: ${items}. Buy more or fix the pantry count.`, "ran_short"]);
    }
    for (const [k, t] of short) {
      if (!t.mismatch) continue;
      const [ing, base] = unkey(k);
      const usual = this.unitOf.get(ing);
      const kept = baseOf(usual) === t.mismatch ? usual! : t.mismatch;
      notes.push(["warn", `${this.names.get(ing)} wasn't taken off the pantry: the recipe uses ${base}, the pantry uses `
        + `${plural(kept)}. Fix the unit in the recipe.`, "ran_short"]);
    }
    return notes;
  }

  private extraNotes(today: ISODate): Note[] {
    const soon = this.potWarnings(today).filter((p) => p.day <= addDays(today, 1)).map((p): Note => ["warn", p.text, "pot_waste"]);
    return [...this.ranShortNotes(today), ...soon];
  }

  private foodLowLevels() {
    return new Map([...this.lowLevels].filter(([k]) => !this.supplies.has(unkey(k)[0])));
  }

  /** Today's and tomorrow's reminders. now: ms. */
  notes(now: number = Date.now()): [string, string][] {
    const today = new Date(now).toISOString().slice(0, 10);
    const out = reminders(now, this.entries(today, addDays(today, 1)), this.recipes, this.items, this.pantry, this.fridge,
      this.names, this.slotPeople, { packs: this.packs, alloc: this.allocation(today), lowLevels: this.foodLowLevels(),
        usual: this.unitOf });
    return [...this.extraNotes(today), ...out].map(([tone, text]) => [tone, text]);
  }

  stocktake(today: ISODate = todayISO(), days = 7, most = 10): [string, string][] {
    const used = new Map<number, number>();
    for (const e of this.entries(addDays(today, -days), today)) {
      if (e.status !== "cooked") continue;
      if (e.recipeId) for (const [ing] of this.items.get(e.recipeId) ?? []) used.set(ing, (used.get(ing) ?? 0) + 1);
      else if (e.ingredientId) used.set(e.ingredientId, (used.get(e.ingredientId) ?? 0) + 1);
    }
    return [...used.keys()].filter((i) => !this.supplies.has(i) && this.names.has(i))
      .sort((a, b) => used.get(b)! - used.get(a)! || cmp(this.names.get(a)!.toLowerCase(), this.names.get(b)!.toLowerCase()))
      .slice(0, most).map((i) => {
        const usual = this.unitOf.get(i) ?? "pcs";
        const base = baseOf(usual);
        const have = this.pantry.get(sk(i, base)) ?? 0;
        return [this.names.get(i)!, have > 0 ? fmtStock(have, base, this.pack(i), usual) : "none"];
      });
  }

  foodLow(): string[] {
    return [...this.lowLevels].filter(([k, level]) => !this.supplies.has(unkey(k)[0]) && (this.pantry.get(k) ?? 0) <= level)
      .map(([k]) => this.names.get(unkey(k)[0]) ?? "?").sort(cmp);
  }

  suppliesLow(): string[] {
    return [...this.supplies].sort((a, b) => cmp((this.names.get(a) ?? "").toLowerCase(), (this.names.get(b) ?? "").toLowerCase()))
      .filter((i) => {
        const k = sk(i, baseOf(this.unitOf.get(i) ?? "pcs"));
        const have = this.pantry.get(k) ?? 0;
        const level = this.lowLevels.get(k);
        return have <= 0 || (level !== undefined && have <= level);
      }).map((i) => this.names.get(i) ?? "?");
  }

  // ---- names and the plan ------------------------------------------------------------------------------------
  entryName(e: Pick<Entry, "label" | "recipeId" | "ingredientId">): string {
    if (e.label && !e.recipeId && !e.ingredientId) return e.label;
    if (e.recipeId) return this.recipes.get(e.recipeId)?.name ?? "Deleted recipe";
    return this.names.get(e.ingredientId!) ?? "Deleted item";
  }

  entries(start: ISODate, end: ISODate = start): Entry[] {
    const out: Entry[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(...(this.byDay.get(d) ?? []));
    return out;
  }

  openEntries(start: ISODate, end: ISODate): Entry[] {
    return this.entries(start, end).filter((e) => e.status === OPEN);
  }

  mealParts(e: Pick<Entry, "day" | "slot">): Entry[] {
    return (this.byDay.get(e.day) ?? []).filter((x) => x.slot === e.slot);
  }

  mealCount(entries: Pick<Entry, "day" | "slot">[]): number {
    return new Set(entries.map((e) => `${e.day}|${e.slot}`)).size;
  }

  partOrder(e: Pick<Entry, "recipeId" | "label" | "id">): [number, number] {
    if (e.recipeId) return [ROLE_ORDER[this.recipes.get(e.recipeId)?.role ?? "main"] ?? 2, e.id ?? 0];
    return [e.label ? 2 : 4, e.id ?? 0];
  }

  sortParts<T extends Pick<Entry, "recipeId" | "label" | "id">>(parts: T[]): T[] {
    return [...parts].sort((a, b) => {
      const [x1, x2] = this.partOrder(a);
      const [y1, y2] = this.partOrder(b);
      return x1 - y1 || x2 - y2;
    });
  }

  /** "Kokonte + Palm nut soup": the starch first, then the soup or stew, then sides. */
  mealName(parts: Pick<Entry, "recipeId" | "label" | "id" | "ingredientId">[]): string {
    const names: string[] = [];
    for (const e of this.sortParts(parts)) {
      const n = this.entryName(e);
      if (!names.includes(n)) names.push(n);
    }
    return names.join(" + ");
  }

  mealNameOf(e: Entry): string {
    return e.id !== null && e.id !== undefined ? this.mealName(this.mealParts(e)) : this.entryName(e);
  }

  isBought(e: Pick<Entry, "recipeId" | "ingredientId" | "label">): boolean {
    if (e.recipeId) return Boolean(this.recipes.get(e.recipeId)?.bought);
    return !e.ingredientId && Boolean(e.label);
  }

  boughtPrice(e: Entry): [number | null, string] {
    if (e.recipeId) {
      const r = this.recipes.get(e.recipeId);
      return [e.price || r?.price || null, r?.countUnit || "portion"];
    }
    return [e.price ?? null, e.unit || "portion"];
  }

  fridgePortions(recipeId: number, today: ISODate = todayISO()): number {
    return this.fridge.filter((b) => b.recipeId === recipeId && b.eatBy >= today).reduce((a, b) => a + b.portions, 0);
  }

  usedIngredients(): Set<number> {
    const used = new Set<number>();
    for (const lines of this.items.values()) for (const [i] of lines) used.add(i);
    for (const e of this.plan) if (e.ingredientId) used.add(e.ingredientId);
    return used;
  }

  pack(ing: number | null | undefined): Pack | null {
    return ing ? this.packs.get(ing) ?? null : null;
  }

  shops(): string[] {
    return [...new Set(this.trips.map((t) => t.shop).filter((x): x is string => Boolean(x)))].sort(cmp);
  }

  wasteThisMonth(today: ISODate = todayISO()): [number, number, number] {
    const w = this.waste.filter((x) => monthOf(x.date) === monthOf(today));
    return [w.reduce((a, x) => a + x.amount, 0), w.reduce((a, x) => a + (x.value ?? 0), 0), w.length];
  }
}

// ---- each meal's status (meals/briefing.py) ---------------------------------------------------------------------
export function missingText(k: Kitchen, missing: Need[], most = 3): string {
  const total = new Map<string, number>();
  for (const [ing, base, q] of missing) total.set(sk(ing, base), (total.get(sk(ing, base)) ?? 0) + Number(q));
  const parts = [...total].map(([key, q]) => {
    const [ing, base] = unkey(key);
    return `${fmt(q, base, k.unitOf.get(ing))} ${k.names.get(ing) ?? "?"}`.trim();
  });
  return parts.slice(0, most).join(", ") + (parts.length > most ? ` +${parts.length - most}` : "");
}

export type Status = "ready" | "leftovers" | "short" | "done" | "bought";

export function entryStatus(k: Kitchen, e: Entry, today: ISODate): [Status, string] {
  if (e.status !== OPEN) return ["done", "done"];
  const m = k.mealState(e.id, today);
  if (!m) return ["ready", ""];
  if (m.status === "leftovers") return ["leftovers", "from the fridge"];
  if (m.status === "bought") {
    const [price] = k.boughtPrice(e);
    return ["bought", "buy on the day" + (price ? `, about GH₵${(price * e.qty).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "")];
  }
  if (m.status === "short") return ["short", `missing ${missingText(k, m.missing)}`];
  return ["ready", "all in"];
}

/** A whole meal: the soup from the fridge and the kokonte to cook counts as all in; anything missing makes it short. */
export function mealStateOf(k: Kitchen, parts: Entry[], today: ISODate): [Status, string] {
  if (parts.length === 1) return entryStatus(k, parts[0], today);
  const states: [string, string[]][] = [];
  const missing: Need[] = [];
  for (const e of parts) {
    const [status] = entryStatus(k, e, today);
    const short = status === "short" ? k.mealState(e.id, today)?.missing ?? [] : [];
    missing.push(...short);
    states.push([status, short.map(([ing]) => k.names.get(ing) ?? "?")]);
  }
  const status = mealStatus(states);
  if (status === "done") return ["done", "done"];
  if (status === "short") return ["short", `missing ${missingText(k, missing)}`];
  if (status === "leftovers") return ["leftovers", "from the fridge"];
  if (status === "bought") return ["bought", "buy on the day"];
  const fridge = parts.filter((_, i) => states[i][0] === "leftovers").map((e) => k.entryName(e));
  const toBuy = parts.filter((_, i) => states[i][0] === "bought").map((e) => k.entryName(e));
  const extra = [...(fridge.length ? [`${fridge.join(", ")} from the fridge`] : []), ...(toBuy.length ? [`buy ${toBuy.join(", ")}`] : [])];
  return ["ready", "all in" + (extra.length ? ` (${extra.join("; ")})` : "")];
}

/** What to cook today and whether it's all in, plus the reminders. */
export function todaySummary(k: Kitchen, now: number = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const meals: { slot: string; name: string; status: Status; label: string }[] = [];
  for (const slot of SLOTS) {
    const parts = k.entries(today).filter((e) => e.slot === slot);
    if (parts.length) {
      const [status, label] = mealStateOf(k, parts, today);
      meals.push({ slot, name: k.mealName(parts), status, label });
    }
  }
  const notes = k.notes(now);
  let note: [string, string] | null = notes[0] ?? null;
  if (!notes.length) {
    if (!meals.length) note = ["info", "Nothing planned for today yet."];
    else if (meals.every((m) => ["ready", "leftovers", "done", "bought"].includes(m.status))) note = ["ok", "Everything for today's meals is in."];
  }
  return { day: today, meals, note, notes: notes.length ? notes : note ? [note] : [], reminders: notes };
}

// ---- the budget guard ---------------------------------------------------------------------------------------------
/** This month's limit and spending across the budgets that cover these money categories. */
export function foodBudget(b: Book, categories: Set<string>, today: ISODate) {
  const status = b.budgetStatus(monthOf(today));
  const groups = new Set([...categories].map((c) => b.groupOf.get(c)));
  let limit = 0;
  let spent = 0;
  const names: string[] = [];
  const covered = new Set<string>();
  for (const s of status) {
    if (s.isGroup && groups.has(s.name)) {
      limit += s.limit;
      spent += s.spent;
      names.push(s.name);
      covered.add(s.name);
    }
  }
  for (const s of status) {
    if (!s.isGroup && categories.has(s.name) && !covered.has(b.groupOf.get(s.name) ?? "")) {
      limit += s.limit;
      spent += s.spent;
      names.push(s.name);
    }
  }
  return names.length ? { limit, spent, names } : null;
}

/** Estimated cost of what the plan still needs bought, from today to the end of the month (within two weeks). */
export function plannedCost(k: Kitchen, today: ISODate): [number, number] {
  const [start, end0] = k.window(today);
  const me = monthEnd(monthOf(today));
  const end = end0 < me ? end0 : me;
  const entries = k.openEntries(start, end);
  const items = shoppingList(shortfall(k.allocation(today), entries), new Map(), undefined, k.prices, k.packs);
  const [bought, boughtUnknown] = boughtCost(entries, k.recipes);
  return [Math.round((items.reduce((a, r) => a + (r.est ?? 0), 0) + bought) * 100) / 100,
    items.filter((r) => r.est === null).length + boughtUnknown];
}

export function suppliesCost(k: Kitchen): number {
  const low = new Map([...k.lowLevels].filter(([key]) => k.supplies.has(unkey(key)[0])));
  const rows = shoppingList(new Map(), k.pantry, low, k.prices, k.packs);
  for (const i of k.supplies) {
    const base = baseOf(k.unitOf.get(i) ?? "pcs");
    if (!low.has(sk(i, base)) && (k.pantry.get(sk(i, base)) ?? 0) <= 0) {
      const pack = k.pack(i);
      const q = pack && pack[2] === base ? pack[1] : toBase(1, k.unitOf.get(i) ?? "pcs")[0];
      rows.push(...shoppingList(new Map([[sk(i, base), { qty: q, short: q, for: [] }]]), new Map(), undefined, k.prices, k.packs));
    }
  }
  return Math.round(rows.reduce((a, r) => a + (r.est ?? 0), 0) * 100) / 100;
}

/** The budget guard for food (the plan's shopping) or household supplies: [tone, text] or null. */
export function guard(k: Kitchen, b: Book | null, today: ISODate, kind: "food" | "household" = "food"): [string, string] | null {
  const cats = kind === "food" ? k.foodCategories : k.supplyCategories;
  const fb = b && cats.size ? foodBudget(b, new Set([...cats].filter(Boolean)), today) : null;
  if (!fb) return null;
  const planned = kind === "food" ? plannedCost(k, today)[0] : suppliesCost(k);
  const g = budgetGuard(fb.limit, fb.spent, planned, kind);
  if (!g) return null;
  return [g.level === "75" ? "hint" : "warn", g.text];
}

export { gh };
