import "server-only";
import { cache } from "react";
import { addDays, fromISO, monthOf, today, toISO } from "../dates";
import { prisma } from "../db";
import { Kitchen, type KitchenData } from "./kitchen";
import type { Need } from "./logic";

const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));
const num = (x: unknown) => Number(x ?? 0);

/** Everything the kitchen screens need, read once per request (the same windows as the Python app). */
export const loadKitchen = cache(async (): Promise<Kitchen> => readKitchen());

export async function readKitchen(now = today()): Promise<Kitchen> {
  const [ingredients, recipes, items, pairings, pairingItems, plan, fridge, pantry, prices, trips, waste, settings] = await Promise.all([
    prisma.ingredient.findMany(),
    prisma.recipe.findMany(),
    prisma.recipeItem.findMany({ orderBy: { id: "asc" } }),
    prisma.pairing.findMany(),
    prisma.pairingItem.findMany({ orderBy: { id: "asc" } }),
    prisma.planEntry.findMany({ where: { day: { gte: fromISO(addDays(now, -40)), lte: fromISO(addDays(now, 63)) } },
      orderBy: [{ day: "asc" }, { id: "asc" }] }),
    prisma.fridgeBatch.findMany({ where: { portions: { gt: 0 } }, orderBy: [{ eatBy: "asc" }, { id: "asc" }] }),
    prisma.pantryStock.findMany(),
    prisma.priceKnown.findMany(),
    prisma.trip.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: 20, include: { _count: { select: { items: true } } } }),
    // only this month's waste is shown (on the fridge page); a year of trip items and bought food is no longer read
    prisma.waste.findMany({ where: { date: { gte: fromISO(`${monthOf(now)}-01`) } }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    prisma.appMeta.findMany({ where: { key: { startsWith: "meals_" } } }),
  ]);
  const data: KitchenData = {
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, category: i.category, lowLevel: n(i.lowLevel),
      packName: i.packName, packSize: n(i.packSize), kind: i.kind, loose: i.loose, altUnits: i.altUnits, section: i.section })),
    recipes: recipes.map((r) => ({ id: r.id, name: r.name, portions: num(r.portions), keepsDays: r.keepsDays, prepNote: r.prepNote,
      prepHours: r.prepHours, method: r.method, bought: r.bought, price: n(r.price), countUnit: r.countUnit ?? "portion",
      shop: r.shop ?? "", category: r.category ?? "", role: r.role })),
    items: items.map((i) => ({ recipeId: i.recipeId, ingredientId: i.ingredientId, qty: num(i.qty), unit: i.unit })),
    pairings: pairings.map((p) => ({ id: p.id, name: p.name })),
    pairingItems: pairingItems.map((p) => ({ pairingId: p.pairingId, recipeId: p.recipeId, ingredientId: p.ingredientId,
      qty: n(p.qty), unit: p.unit })),
    plan: plan.map((e) => {
      const undo = (e.undo ?? {}) as { short?: Need[] };
      return { id: e.id, day: toISO(e.day), slot: e.slot, recipeId: e.recipeId, ingredientId: e.ingredientId, qty: num(e.qty),
        unit: e.unit, status: e.status, doneBy: e.doneBy, label: e.label, price: n(e.price),
        short: Array.isArray(undo.short) ? undo.short : [], people: n(e.people) };
    }),
    fridge: fridge.map((b) => ({ id: b.id, recipeId: b.recipeId, label: b.label, portions: num(b.portions),
      cookedOn: toISO(b.cookedOn), eatBy: toISO(b.eatBy), unit: b.unit || "portion" })),
    pantry: pantry.map((p) => ({ ingredientId: p.ingredientId, unit: p.unit, qty: num(p.qty) })),
    prices: prices.map((p) => ({ ingredientId: p.ingredientId, unit: p.unit, perUnit: num(p.perUnit) })),
    trips: trips.map((t) => ({ id: t.id, date: toISO(t.date), account: t.account, total: num(t.total), createdBy: t.createdBy,
      shop: t.shop, items: t._count.items })),
    waste: waste.map((w) => ({ id: w.id, date: toISO(w.date), label: w.label, amount: num(w.amount), unit: w.unit,
      value: n(w.value), recipeId: w.recipeId })),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""])),
  };
  return new Kitchen(data);
}
