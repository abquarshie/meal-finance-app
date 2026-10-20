"use server";
// Read-only helpers for the meal plan's add form (meals/pages/plan.py, _add_form), asked as the form changes.
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addDays, isISODate, today } from "@/lib/dates";
import { loadKitchen } from "@/lib/kitchen/load";
import { fromLeftovers, recipeCost, repeatPlan, SLOTS } from "@/lib/kitchen/logic";
import { addToPlan } from "./kitchen";
import { frac, plural } from "@/lib/kitchen/units";
import { money } from "@/lib/money";

export type DishDefault = { qty: number; note: string; unit?: string };

/** For each picked dish ("r:12" a recipe, "i:5" an item, a pairing already expanded): how much to plan by default,
 * and a hint. Also what the whole meal will be called, with anything already planned for it. */
export async function planDefaults(day: string, slot: string, people: number, keys: string[], sides: Record<string, { qty: number; unit: string }>)
  : Promise<{ lines: Record<string, DishDefault>; mealName: string; joins: boolean }> {
  await requireUser();
  if (!isISODate(day) || !(SLOTS as readonly string[]).includes(slot)) return { lines: {}, mealName: "", joins: false };
  const k = await loadKitchen();
  const now = today();
  const p = z.number().min(0).max(100).catch(1).parse(people);
  const lines: Record<string, DishDefault> = {};
  for (const key of z.array(z.string().max(20)).max(30).parse(keys)) {
    const [kind, raw] = key.split(":");
    const i = Number(raw);
    if (kind === "r" && k.recipes.has(i)) {
      const r = k.recipes.get(i)!;
      if (r.bought) {
        lines[key] = { qty: Math.max(p, 1), note: r.price ? `About ${money(r.price * Math.max(p, 1))}, paid on the day${r.shop ? ` at ${r.shop}` : ""}.` : "" };
        continue;
      }
      const leftover = r.role !== "starch" && fromLeftovers(k.openEntries(...k.window(now)), k.recipes, k.items, k.pantry,
        k.fridge, p, now, day, slot, i, k.packs);
      const qty = r.role === "starch" ? Math.max(p, 0.5) : leftover ? Math.max(Math.min(p, r.portions), 0.5) : r.portions;
      lines[key] = { qty, note: dishNote(k, i, qty, p, leftover) };
    } else if (kind === "i" && k.names.has(i)) {
      const side = sides[key];
      lines[key] = { qty: side ? side.qty * p : 1, unit: side?.unit ?? k.unitOf.get(i) ?? "pcs", note: "" };
    }
  }
  const planned = k.entries(day).filter((e) => e.slot === slot);
  const fake = Object.keys(lines).map((key, n) => {
    const [kind, raw] = key.split(":");
    return { id: 1e9 + n, recipeId: kind === "r" ? Number(raw) : null, ingredientId: kind === "i" ? Number(raw) : null, label: null };
  });
  const all = [...planned, ...fake];
  return { lines, mealName: all.length > 1 ? k.mealName(all) : "", joins: planned.length > 0 };
}

/** The hint under a dish: "About GH₵38.50; 12 portions will go into the fridge." */
function dishNote(k: Awaited<ReturnType<typeof loadKitchen>>, rid: number, qty: number, people: number, leftover: boolean): string {
  const notes: string[] = [];
  const left = qty - Math.min(people, qty);
  if (leftover && qty <= people) notes.push("comes from the leftovers in the fridge, no need to cook");
  else {
    const [batch, each, unknown] = recipeCost(rid, k.recipes, k.items, k.prices, k.packs);
    if (batch) notes.push(`${unknown ? "at least" : "about"} ${money(each * qty)}`);
    const have = k.fridgePortions(rid);
    if (have) notes.push(`${frac(have)} already in the fridge`);
    if (left > 0) notes.push(`${frac(left)} ${plural("portion", left)} will go into the fridge`);
  }
  if (!notes.length) return "";
  const s = notes.join("; ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** Note for a changed amount (the hint follows the number typed). */
export async function dishHint(day: string, slot: string, people: number, recipeId: number, qty: number): Promise<string> {
  await requireUser();
  const k = await loadKitchen();
  const r = k.recipes.get(recipeId);
  if (!r || r.bought || !isISODate(day)) return "";
  const now = today();
  const leftover = r.role !== "starch" && fromLeftovers(k.openEntries(...k.window(now)), k.recipes, k.items, k.pantry, k.fridge,
    people, now, day, slot, recipeId, k.packs);
  return dishNote(k, recipeId, qty, people, leftover);
}

/** Most weeks look like the one before: each empty meal in the next two weeks gets what was planned 7 days earlier. */
export async function copyLastWeek() {
  await requireUser();
  const k = await loadKitchen();
  const now = today();
  const fresh = repeatPlan(k.plan, now, 14);
  if (!fresh.length) return { ok: false as const, error: "Nothing to copy: every meal is already planned." };
  const r = await addToPlan(fresh.map((e) => ({ day: e.day, slot: e.slot as (typeof SLOTS)[number], recipeId: e.recipeId,
    ingredientId: e.ingredientId, qty: e.qty, unit: e.unit, label: e.label ?? null, price: e.price ?? null, people: e.people ?? null })));
  const n = k.mealCount(fresh);
  return r.ok ? { ok: true as const, message: `Copied ${n} meal${n === 1 ? "" : "s"}. Change anything that's different.` } : r;
}

export async function addIdea(day: string, slot: string, recipeId: number) {
  await requireUser();
  const k = await loadKitchen();
  const r = k.recipes.get(recipeId);
  if (!r || !isISODate(day)) return { ok: false as const, error: "That dish is no longer in the recipe book." };
  const res = await addToPlan([{ day, slot: slot as (typeof SLOTS)[number], recipeId, qty: r.portions }]);
  const when = day === today() ? "today" : day === addDays(today(), 1) ? "tomorrow" : day;
  return res.ok ? { ok: true as const, message: `Added ${r.name} to ${when}, ${slot.toLowerCase()}` } : res;
}
