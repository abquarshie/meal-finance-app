// Runs only when KITCHEN_JSON points at what the Python Kitchen said about the same database (tests/parity/).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBook } from "@/lib/load";
import { entryStatus, guard, mealStateOf, plannedCost, suppliesCost, todaySummary, Kitchen } from "@/lib/kitchen/kitchen";
import { readKitchen } from "@/lib/kitchen/load";
import { fromLeftovers, recipeCost, repeatPlan, sk, SLOTS, suggest, unkey } from "@/lib/kitchen/logic";
import { fmt, fmtStock, frac } from "@/lib/kitchen/units";
import { shoppingRows } from "@/lib/kitchen/shopping";
import { addDays } from "@/lib/dates";

const file = process.env.KITCHEN_JSON;
const py = file ? JSON.parse(readFileSync(file, "utf8")) : null;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const cents = (x: any): any => typeof x === "number" ? Math.round(x * 1e4) / 1e4
  : Array.isArray(x) ? x.map(cents) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, cents(v)])) : x;

describe.skipIf(!py)("the kitchen gives the same answers as the Python app", async () => {
  const k: Kitchen = py ? await readKitchen(py.today) : (null as never);
  const today: string = py?.today;
  const at = (h: number) => Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8), h, 30);

  it("shares the stock out across the plan the same way", () => {
    const a = k.allocation(today);
    const got = Object.fromEntries([...a.meals].map(([i, m]) => [String(i), { status: m.status,
      missing: m.missing.map(([x, b, q]) => [x, b, r6(q)]), needs: m.needs.map(([x, b, q]) => [x, b, r6(q)]) }]));
    expect(got).toEqual(py.meals);
    expect(Object.fromEntries([...a.stockAfter].map(([key, v]) => [key, r6(v)]))).toEqual(py.stock_after);
    expect(Object.fromEntries([...a.pots].map(([i, p]) => [String(i), { recipe_id: p.recipeId, day: p.day, slot: p.slot,
      cooked: p.cooked, eaten: p.eaten, eat_by: p.eatBy, left: p.left }]))).toEqual(py.pots);
  });

  it("warns about the same pots, shortfalls and reminders", () => {
    expect(k.potWarnings(today).map((p) => ({ entry_id: p.entryId, text: p.text, suggest: p.suggest }))).toEqual(py.pot_warnings);
    expect(Object.fromEntries(k.ranShort(today))).toEqual(py.ran_short);
    for (const h of [5, 8, 21]) expect(k.notes(at(h))).toEqual(py.notes[String(h)]);
  });

  it("makes the same shopping lists", () => {
    for (const days of [7, 14, 2]) {
      const rows = shoppingRows(k, today, days)
        .map((r) => ({ ingredient_id: r.ingredientId, base: r.base, need: r6(r.need), have: r6(r.have), to_buy: r6(r.toBuy),
          reason: r.reason, low: r.low, packs: r.packs, pack: r.pack, buy_qty: r6(r.buyQty), est: r.est }));
      expect(rows).toEqual(py.shopping[String(days)]);
    }
  });

  it("names and judges every meal the same way, and the Today card matches", () => {
    for (const [key, w] of Object.entries<any>(py.states)) {
      const [day, slot] = key.split("|");
      const parts = k.entries(day).filter((e) => e.slot === slot);
      expect(k.mealName(parts)).toBe(w.name);
      expect(mealStateOf(k, parts, today)).toEqual(w.state);
      expect(parts.map((e) => entryStatus(k, e, today))).toEqual(w.each);
    }
    const s = todaySummary(k, at(8) - 30 * 60_000);
    expect({ meals: s.meals.map((m) => [m.slot, m.name, m.status, m.label]), note: s.note, notes: s.notes }).toEqual(py.summary);
  });

  it("costs, ideas, stock check, people per meal and the budget guard", async () => {
    for (const [rid, want] of Object.entries<any>(py.recipe_cost)) {
      expect(cents(recipeCost(Number(rid), k.recipes, k.items, k.prices, k.packs))).toEqual(cents(want));
    }
    const home = new Map([...k.recipes].filter(([, r]) => !r.bought && !["starch", "side"].includes(r.role ?? "main")));
    expect(suggest(home, k.items, k.pantry, k.fridge, k.plan.filter((e) => e.day >= addDays(today, -21)), today, k.packs)
      .map((x) => ({ recipe_id: x.recipeId, score: x.score, reasons: x.reasons }))).toEqual(py.suggest);
    expect(k.stocktake(today)).toEqual(py.stocktake);
    expect([k.foodLow(), k.suppliesLow()]).toEqual([py.food_low, py.supplies_low]);
    expect(cents(plannedCost(k, today))).toEqual(cents(py.planned_cost));
    expect(cents(suppliesCost(k))).toEqual(cents(py.supplies_cost));
    const b = await readBook();
    expect(guard(k, b, today, "food")).toEqual(py.guard_food);
    expect(guard(k, b, today, "household")).toEqual(py.guard_household);
    expect(repeatPlan(k.plan, today, 14).map((e) => ({ day: e.day, slot: e.slot, recipe_id: e.recipeId, ingredient_id: e.ingredientId,
      qty: e.qty, unit: e.unit, label: e.label, price: e.price, people: e.people }))).toEqual(py.repeat);
    expect(k.slotPeople).toEqual(py.slot_people);
    expect(k.household).toBe(py.household);
    for (const [key, v] of Object.entries(py.meal_people)) {
      const [d, slot] = key.split("|");
      expect(k.mealPeople(addDays(today, Number(d)), slot)).toBe(v);
    }
    expect(cents(k.wasteThisMonth(today))).toEqual(cents(py.waste_month));
    for (const [key, v] of Object.entries(py.from_leftovers)) {
      const [d, slot, name] = key.split("|");
      const rid = [...k.recipes].find(([, r]) => r.name === name)![0];
      expect(fromLeftovers(k.openEntries(...k.window(today)), k.recipes, k.items, k.pantry, k.fridge, k.slotPeople[slot], today,
        addDays(today, Number(d)), slot, rid, k.packs)).toBe(v);
    }
  });

  it("formats amounts the same way", () => {
    for (const [q, base, usual, want] of py.fmt) expect(fmt(q, base, usual)).toBe(want);
    for (const [x, want] of py.frac) expect(frac(x)).toBe(want);
    const stock = [...k.pantry].sort(([a], [b]) => {
      const [i1, u1] = unkey(a);
      const [i2, u2] = unkey(b);
      return i1 - i2 || (u1 < u2 ? -1 : 1);
    }).map(([key, q]) => {
      const [i, u] = unkey(key);
      return [k.names.get(i), fmtStock(q, u, k.pack(i), k.unitOf.get(i))];
    });
    expect(stock).toEqual(py.stock_fmt);
    void SLOTS; void sk;
  });
});
