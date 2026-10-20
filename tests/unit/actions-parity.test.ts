// The same steps as tests/parity/scenario.py, done by this app's server actions. Runs when ACTIONS_DB is set: a copy
// of a seeded database (see tests/parity/README). Afterwards tests/parity/state.py compares it with the Python copy.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: 1, username: "ama", name: "Ama", isOwner: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const url = process.env.ACTIONS_DB;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("the kitchen actions", () => {
  it("run the scenario", async () => {
    const k = await import("@/actions/kitchen");
    const { prisma } = await import("@/lib/db");
    const { addDays, fromISO, today } = await import("@/lib/dates");
    const t = today();
    const entries = async (day: number, slot: string) => (await prisma.planEntry.findMany({
      where: { day: fromISO(addDays(t, day)), slot }, orderBy: { id: "asc" } })).map((e) => e.id);
    const one = async (label: string) => (await prisma.fridgeBatch.findFirstOrThrow({ where: { label } })).id;
    const ing = new Map((await prisma.ingredient.findMany()).map((i) => [i.name, i.id]));
    const okay = (r: { ok: boolean; error?: string }) => expect(r.error ?? "").toBe("") ;

    okay(await k.tickMeal(await entries(0, "Breakfast"), "meal"));
    okay(await k.tickMeal(await entries(0, "Supper"), "meal"));
    okay(await k.tickMeal([(await entries(1, "Lunch"))[0]], "cook"));
    okay(await k.tickMeal([(await entries(1, "Breakfast"))[1]], "fridge"));
    okay(await k.markBought(await entries(0, "Lunch"), 28, "Cash", "Dining Out"));
    okay(await k.untick(await entries(0, "Supper")));
    okay(await k.tickMeal(await entries(1, "Supper"), "meal"));
    okay(await k.tickMeal(await entries(-1, "Supper"), "meal"));
    okay(await k.eatPortion(await one("Light soup"), 1));
    okay(await k.throwAway(await one("Shito"), 5));
    okay(await k.saveTrip(t, "GCB", [
      { ingredientId: ing.get("Tomatoes")!, name: "Tomatoes", qty: 10, base: "pcs", price: 18, category: "Fruits/Veges" },
      { ingredientId: ing.get("Beef")!, name: "Beef", qty: 1000, base: "g", price: 120, category: "Meat/Fish" },
      { ingredientId: ing.get("Bleach")!, name: "Bleach", qty: 1000, base: "ml", price: 25, category: "Cleaning supplies" },
      { ingredientId: ing.get("Onions")!, name: "Onions", qty: 5, base: "pcs", price: 0, category: "Fruits/Veges" },
    ], "Makola"));
    okay(await k.setStock([{ ingredientId: ing.get("Gari")!, base: "ml", qty: 1000 }, { ingredientId: ing.get("Palm oil")!, base: "ml", qty: 0 }]));
    okay(await k.adjustStock(ing.get("Toilet roll")!, "pcs", -1));
    okay(await k.untick(await entries(0, "Lunch")));
    okay(await k.removeFromPlan(await entries(2, "Lunch")));
    okay(await k.setMealPeople(addDays(t, 3), "Supper", 5));
    okay(await k.setPlanQty((await entries(8, "Supper"))[1], 6));
    okay(await k.addToFridge("Shito", 3, addDays(t, 10), null, "bowl"));
    okay(await k.addToPlan([{ day: addDays(t, 10), slot: "Lunch", ingredientId: ing.get("Eggs")!, qty: 2, unit: "pcs" },
      { day: addDays(t, 10), slot: "Lunch", label: "Bofrot", qty: 4, unit: "piece", price: 1.5 }]));
    okay(await k.markBought(await entries(9, "Lunch"), 13, "GCB", "Dining Out"));
  }, 60_000);
});
