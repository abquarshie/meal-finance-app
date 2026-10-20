"use server";
// Everything that changes kitchen data: a port of meals/actions.py. Each action is one transaction. Ticking a meal
// records exactly what it changed in the pantry and fridge (in the same "undo" format as the Python app), so
// unticking, in either app, puts things back as they were.
import { z } from "zod";
import { amount, attempt, fail, isoDate, ok, optionalMoney, type Result } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { addDays, fromISO, today, toISO } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { eaters, entryNeeds, OPEN, priceChanges, SLOTS, takePortions, type Need, type TripLine } from "@/lib/kitchen/logic";
import { addStock, lockEntry, packsOf, recipeOf, slotPeople, takeStock, type LockedEntry, type Undo } from "@/lib/kitchen/stock";
import { HOUSEHOLD_KEY, slotKey } from "@/lib/kitchen/kitchen";
import { fmt, frac, plural, toBase, type Pack } from "@/lib/kitchen/units";
import { FEE_CATEGORY, money, SHARED } from "@/lib/money";

const id = z.number().int().positive();
const ids = z.array(id).min(1).max(50);
const TIMEOUT = { timeout: 30_000 };
void FEE_CATEGORY;

// ---- ticking meals ---------------------------------------------------------------------------------------------
async function isBoughtEntry(tx: Tx, e: LockedEntry) {
  if (e.recipeId) return Boolean((await tx.recipe.findUnique({ where: { id: e.recipeId } }))?.bought);
  return !e.ingredientId && Boolean(e.label);
}

/** The recipe's ingredients come out of the pantry; portions not eaten now go into the fridge. Returns what the
 * pantry didn't have. */
async function cook(tx: Tx, e: LockedEntry, household: Record<string, number>, packs: Map<number, Pack>, me: string) {
  const { recipe, items } = await recipeOf(tx, e.recipeId!);
  const uses = entryNeeds(e, new Map([[e.recipeId!, recipe]]), new Map([[e.recipeId!, items]]), packs);
  const removed: Need[] = [];
  const short: Need[] = [];
  for (const [ing, base, q] of uses) {
    const took = await takeStock(tx, ing, base, q);
    removed.push([ing, base, took]);
    if (q - took > 1e-6) short.push([ing, base, q - took]);
  }
  const left = Math.max(e.qty - Math.min(eaters(e, household), e.qty), 0);
  let made: [number, number] | null = null;
  // leftovers are dated from the meal, not from when it was ticked; if they'd already be past their eat-by date,
  // nothing goes into the fridge
  const now = today();
  const cooked = e.day < now ? e.day : now;
  if (left > 0 && addDays(cooked, recipe.keepsDays) >= now) {
    const b = await tx.fridgeBatch.create({ data: { recipeId: e.recipeId, label: recipe.name, portions: left,
      cookedOn: fromISO(cooked), eatBy: fromISO(addDays(cooked, recipe.keepsDays)), planId: e.id, createdBy: me } });
    made = [b.id, left];
  }
  await tx.planEntry.update({ where: { id: e.id }, data: { status: "cooked", doneAt: new Date(), doneBy: me,
    undo: { pantry: removed, fridge_made: made, short } } });
  return { short, left: made ? left : 0, tooOld: left > 0 && !made };
}

/** Portions come off the leftovers that go off soonest (never food past its eat-by date). */
async function eatLeftovers(tx: Tx, e: LockedEntry, household: Record<string, number>, me: string) {
  const wanted = Math.min(eaters(e, household), e.qty);
  const rows = await tx.$queryRaw<{ id: number; portions: number; eat_by: Date }[]>`SELECT id, portions::float8 AS portions, eat_by
    FROM meals.fridge WHERE recipe_id = ${e.recipeId} AND portions > 0 AND eat_by >= ${fromISO(today())}::date FOR UPDATE`;
  const [taken, missing] = takePortions(rows.map((r) => ({ id: r.id, portions: Number(r.portions), eatBy: toISO(r.eat_by) })), wanted);
  for (const [bid, t] of taken) await tx.$executeRaw`UPDATE meals.fridge SET portions = GREATEST(portions - ${t}::numeric, 0) WHERE id = ${bid}`;
  await tx.planEntry.update({ where: { id: e.id }, data: { status: "from_fridge", doneAt: new Date(), doneBy: me,
    undo: { fridge_taken: taken } } });
  return missing;
}

/** A plain item (fruit, bread, gari) comes out of the pantry. */
async function eaten(tx: Tx, e: LockedEntry, packs: Map<number, Pack>, me: string) {
  const [q, base] = toBase(e.qty, e.unit || "pcs", packs.get(e.ingredientId!));
  const took = await takeStock(tx, e.ingredientId!, base, q);
  const short: Need[] = q - took > 1e-6 ? [[e.ingredientId!, base, q - took]] : [];
  await tx.planEntry.update({ where: { id: e.id }, data: { status: "done", doneAt: new Date(), doneBy: me,
    undo: { pantry: [[e.ingredientId!, base, took]], short } } });
  return short;
}

export type TickResult = Result<{ cooked: string[]; fridge: string[]; short: Need[]; intoFridge: number; tooOld: boolean;
  shortText: string }>;

/** "200 g Groundnut paste, 3 Onions" */
async function describeShort(short: Need[]): Promise<string> {
  if (!short.length) return "";
  const rows = await prisma.ingredient.findMany({ where: { id: { in: short.map(([i]) => i) } } });
  const by = new Map(rows.map((r) => [r.id, r]));
  return short.map(([i, base, q]) => `${fmt(q, base, by.get(i)?.unit)} ${by.get(i)?.name ?? "?"}`.replace(" pcs", "")).join(", ");
}

/** Ticking food off. Plain items come out of the pantry; bought food is ticked when it's paid for (markBought).
 * mode "meal": one tick for a meal (Kokonte + Palm nut soup): a dish with enough fresh leftovers is eaten from the
 *   fridge, any other is cooked;
 * mode "cook": a single dish's tick box: it was cooked;
 * mode "fridge": the Fridge button on a dish: leftovers were eaten instead of cooking. */
export async function tickMeal(entryIds: number[], mode: "meal" | "cook" | "fridge" = "meal"): Promise<TickResult> {
  const user = await requireUser();
  return attempt(async () => {
    const list = ids.parse(entryIds);
    const out = await prisma.$transaction(async (tx) => {
      const r = { cooked: [] as string[], fridge: [] as string[], short: [] as Need[], intoFridge: 0, tooOld: false };
      const packs = await packsOf(tx);
      const household = await slotPeople(tx);
      for (const i of list) {
        const e = await lockEntry(tx, i);
        if (!e || e.status !== OPEN || (await isBoughtEntry(tx, e))) continue;
        if (e.recipeId) {
          const name = (await tx.recipe.findUniqueOrThrow({ where: { id: e.recipeId } })).name;
          const want = Math.min(eaters(e, household), e.qty);
          const have = await tx.$queryRaw<{ n: number }[]>`SELECT COALESCE(SUM(portions), 0)::float8 AS n FROM meals.fridge
            WHERE recipe_id = ${e.recipeId} AND portions > 0 AND eat_by >= ${fromISO(today())}::date`;
          if (mode === "fridge" || (mode === "meal" && Number(have[0].n) >= want - 1e-9)) {
            await eatLeftovers(tx, e, household, user.username);
            r.fridge.push(name);
          } else {
            const c = await cook(tx, e, household, packs, user.username);
            r.short.push(...c.short);
            r.intoFridge += c.left;
            r.tooOld ||= c.tooOld;
            r.cooked.push(name);
          }
        } else if (e.ingredientId) {
          r.short.push(...(await eaten(tx, e, packs, user.username)));
        }
      }
      return r;
    }, TIMEOUT);
    const bits = [...(out.cooked.length ? [`cooked ${out.cooked.join(" and ")}`] : []),
      ...(out.fridge.length ? [`${out.fridge.join(" and ")} from the fridge`] : [])];
    let message = bits.length ? `Ticked off: ${bits.join("; ")}.` : "Ticked off.";
    if (out.intoFridge) message += ` ${frac(out.intoFridge)} ${plural("portion", out.intoFridge)} put in the fridge.`;
    if (out.tooOld) message += " It was too long ago for leftovers to still be good, so nothing went into the fridge.";
    return ok(message, { ...out, shortText: await describeShort(out.short) });
  });
}

/** Undo what ticking this entry did to the pantry and fridge (or, for bought food, the payment). */
async function reverse(tx: Tx, e: LockedEntry) {
  const undo: Undo = e.undo ?? {};
  if (undo.tx) { // a shared payment (several bought dishes in one meal) is deleted by the first one
    await tx.transaction.deleteMany({ where: { id: undo.tx } });
    if (undo.bought) await tx.boughtFood.deleteMany({ where: { id: undo.bought } });
    if (e.recipeId && "price_before" in undo) await tx.recipe.update({ where: { id: e.recipeId }, data: { price: undo.price_before } });
  }
  for (const [ing, base, q] of undo.pantry ?? []) await addStock(tx, Number(ing), base, Number(q));
  if (undo.fridge_made) {
    await tx.$executeRaw`UPDATE meals.fridge SET portions = GREATEST(portions - ${Number(undo.fridge_made[1])}::numeric, 0)
      WHERE id = ${Number(undo.fridge_made[0])}`;
  }
  for (const [bid, t] of undo.fridge_taken ?? []) {
    await tx.$executeRaw`UPDATE meals.fridge SET portions = portions + ${Number(t)}::numeric WHERE id = ${Number(bid)}`;
  }
}

/** Put the pantry, fridge and any payment back for every ticked dish of a meal. */
export async function untick(entryIds: number[]): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const list = ids.parse(entryIds);
    await prisma.$transaction(async (tx) => {
      for (const i of list) {
        const e = await lockEntry(tx, i);
        if (!e || e.status === OPEN) continue;
        await reverse(tx, e);
        await tx.$executeRaw`UPDATE meals.plan SET status = 'planned', done_at = NULL, done_by = NULL, undo = NULL WHERE id = ${e.id}`;
      }
    }, TIMEOUT);
    return ok("Unticked. The pantry, fridge and any payment are back as they were.");
  });
}

/** Bought food was bought: one expense for the meal's bought dishes, shared between them by their usual prices to
 * keep each dish's price up to date. Unticking takes it all back out. */
export async function markBought(entryIds: number[], paid: number, account: string, category: string): Promise<Result> {
  const user = await requireUser();
  return attempt(async () => {
    const list = ids.parse(entryIds);
    const p = amount.parse(paid);
    const acct = await prisma.account.findUnique({ where: { name: account } });
    if (!acct) return fail("Pick one of your accounts.");
    if (!(await prisma.category.findUnique({ where: { name: category } }))) return fail("Pick one of your categories.");
    const name = await prisma.$transaction(async (tx) => {
      const entries = (await Promise.all(list.map((i) => lockEntry(tx, i)))).filter((e): e is LockedEntry => !!e && e.status === OPEN);
      if (!entries.length) return null;
      const rows = [];
      for (const e of entries) {
        let name: string;
        let unit: string;
        let shop: string | null = null;
        let before: number | null = null;
        if (e.recipeId) {
          const r = await tx.recipe.findUniqueOrThrow({ where: { id: e.recipeId } });
          [name, unit, shop, before] = [r.name, r.countUnit ?? "portion", r.shop, r.price === null ? null : Number(r.price)];
        } else [name, unit] = [e.label ?? "food", e.unit ?? "portion"];
        rows.push({ e, name, unit: unit || "portion", shop, before, expected: (e.price || before || 0) * e.qty });
      }
      const day = [...entries.map((e) => e.day), today()].sort()[0];
      const shops = [...new Set(rows.map((r) => r.shop).filter(Boolean))];
      const note = "Bought: " + rows.map((r) => `${r.name} (${frac(r.e.qty)} ${plural(r.unit, r.e.qty)})`).join(" + ")
        + (shops.length ? ` at ${shops.join(", ")}` : "");
      const t = await tx.transaction.create({ data: { date: fromISO(day), type: "Expense", category, amount: Math.round(p * 100) / 100,
        note, member: SHARED, account, createdBy: user.username } });
      const totalExpected = rows.reduce((a, r) => a + r.expected, 0);
      for (const r of rows) {
        const share = p * (totalExpected ? r.expected / totalExpected : 1 / rows.length);
        const b = await tx.boughtFood.create({ data: { date: fromISO(day), planId: r.e.id, recipeId: r.e.recipeId, label: r.name,
          qty: r.e.qty, unit: r.unit, paid: Math.round(share * 100) / 100, shop: r.shop } });
        if (r.e.recipeId && r.e.qty) await tx.recipe.update({ where: { id: r.e.recipeId }, data: { price: Math.round((share / r.e.qty) * 100) / 100 } });
        await tx.planEntry.update({ where: { id: r.e.id }, data: { status: "bought", doneAt: new Date(), doneBy: user.username,
          undo: { tx: t.id, bought: b.id, price_before: r.before } } });
      }
      return rows.map((r) => r.name).join(" + ");
    }, TIMEOUT);
    return name ? ok(`Saved ${money(p)} for ${name} under ${category}`) : fail("That's already been ticked off.");
  });
}

// ---- the plan --------------------------------------------------------------------------------------------------
const NewEntry = z.object({
  day: isoDate, slot: z.enum(SLOTS), recipeId: id.nullable().default(null), ingredientId: id.nullable().default(null),
  qty: z.number().positive().max(10_000), unit: z.string().max(12).nullable().default(null),
  label: z.string().trim().max(80).nullable().default(null), price: optionalMoney.default(null),
  people: z.number().min(0).max(100).nullable().default(null),
}).refine((e) => e.recipeId || e.ingredientId || e.label, "Pick a dish or an item.");

/** Several dishes at once; with setPeople, every dish of that meal (already there too) gets the same number. */
export async function addToPlan(entries: z.input<typeof NewEntry>[], setPeople?: { day: string; slot: string; people: number | null })
  : Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const list = z.array(NewEntry).min(1).max(50).parse(entries);
    await prisma.$transaction(async (tx) => {
      await tx.planEntry.createMany({ data: list.map((e) => ({ ...e, day: fromISO(e.day) })) });
      if (setPeople) {
        await tx.planEntry.updateMany({ where: { day: fromISO(isoDate.parse(setPeople.day)), slot: setPeople.slot },
          data: { people: setPeople.people } });
      }
    });
    const n = list.length;
    const d = list[0].day;
    const when = d === today() ? "today" : d === addDays(today(), 1) ? "tomorrow" : d;
    return ok(n > 1 ? `Added ${n} to ${when}, ${list[0].slot.toLowerCase()}` : `Added to ${when}, ${list[0].slot.toLowerCase()}`);
  });
}

/** Remove a dish (or every dish of a meal). A ticked one gives its ingredients and portions back first. */
export async function removeFromPlan(entryIds: number[]): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const list = ids.parse(entryIds);
    await prisma.$transaction(async (tx) => {
      for (const i of list) {
        const e = await lockEntry(tx, i);
        if (e && e.status !== OPEN) await reverse(tx, e);
        await tx.planEntry.deleteMany({ where: { id: i } });
      }
    }, TIMEOUT);
    return ok("Removed from the plan");
  });
}

/** A smaller (or bigger) pot, while it hasn't been cooked yet. */
export async function setPlanQty(entryId: number, qty: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const q = z.number().positive().max(10_000).parse(qty);
    const e = await prisma.planEntry.findUnique({ where: { id: id.parse(entryId) }, include: { recipe: true } });
    await prisma.planEntry.updateMany({ where: { id: entryId, status: OPEN }, data: { qty: q } });
    return ok(`${e?.recipe?.name ?? "That dish"}: now ${frac(q)} ${plural("portion", q)}`);
  });
}

/** How many eat one day's meal; null goes back to the usual number. */
export async function setMealPeople(day: string, slot: string, people: number | null): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const d = isoDate.parse(day);
    const s = z.enum(SLOTS).parse(slot);
    const n = z.number().min(0).max(100).nullable().parse(people);
    await prisma.planEntry.updateMany({ where: { day: fromISO(d), slot: s }, data: { people: n } });
    return ok(`${s}: ${n === null ? "back to the usual number" : `${frac(n)} ${n === 1 ? "person" : "people"}`}`);
  });
}

/** The usual number at each meal, and the household size. */
export async function setPeopleSettings(counts: Record<string, number>, household: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const h = z.number().int().min(1).max(30).parse(household);
    const c = z.record(z.enum(SLOTS), z.number().int().min(0).max(30)).parse(counts);
    await prisma.$transaction([
      ...Object.entries(c).map(([slot, n]) => prisma.appMeta.upsert({ where: { key: slotKey(slot) },
        create: { key: slotKey(slot), value: String(n) }, update: { value: String(n) } })),
      prisma.appMeta.upsert({ where: { key: HOUSEHOLD_KEY }, create: { key: HOUSEHOLD_KEY, value: String(h) }, update: { value: String(h) } }),
    ]);
    return ok(`Saved: ${Object.entries(c).map(([s, n]) => `${n} at ${s.toLowerCase()}`).join(", ")}`);
  });
}

// ---- fridge and pantry -----------------------------------------------------------------------------------------
/** One eaten. Taken off what's there now, so two people tapping at once both count. */
export async function eatPortion(batchId: number, amountEaten = 1): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const a = z.number().positive().max(100).parse(amountEaten);
    await prisma.$executeRaw`UPDATE meals.fridge SET portions = GREATEST(portions - ${a}::numeric, 0) WHERE id = ${id.parse(batchId)}`;
    return ok("Eaten");
  });
}

export async function setPortions(batchId: number, portions: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    await prisma.fridgeBatch.update({ where: { id: id.parse(batchId) }, data: { portions: z.number().min(0).max(1000).parse(portions) } });
    return ok("Saved");
  });
}

export async function addToFridge(label: string, portions: number, eatBy: string, recipeId: number | null, unit: string): Promise<Result> {
  const user = await requireUser();
  return attempt(async () => {
    const l = z.string().trim().min(1, "Say what it is.").max(80).parse(label);
    const p = z.number().positive().max(1000).parse(portions);
    await prisma.fridgeBatch.create({ data: { recipeId: recipeId ? id.parse(recipeId) : null, label: l, portions: p,
      cookedOn: fromISO(today()), eatBy: fromISO(isoDate.parse(eatBy)), createdBy: user.username, unit: z.string().max(12).parse(unit) || "portion" } });
    return ok(`Added ${frac(p)} ${plural(unit || "portion", p)} of ${l}`);
  });
}

/** Thrown away: logged as food waste with its estimated cost, and taken out of the fridge. */
export async function throwAway(batchId: number, valueEach: number | null): Promise<Result> {
  const user = await requireUser();
  return attempt(async () => {
    const gone = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ label: string; portions: number; unit: string; recipe_id: number | null }[]>`SELECT label,
        portions::float8 AS portions, unit, recipe_id FROM meals.fridge WHERE id = ${id.parse(batchId)} FOR UPDATE`;
      const b = rows[0];
      if (!b || b.portions <= 0) return null;
      await tx.waste.create({ data: { date: fromISO(today()), label: b.label, amount: b.portions, unit: b.unit,
        value: valueEach ? Math.round(valueEach * b.portions * 100) / 100 : null, recipeId: b.recipe_id, createdBy: user.username } });
      await tx.fridgeBatch.update({ where: { id: batchId }, data: { portions: 0 } });
      return b;
    });
    if (!gone) return fail("That's already gone from the fridge.");
    return ok(`Logged ${frac(gone.portions)} of ${gone.label} as thrown away` + (valueEach ? ` (about ${money(valueEach * gone.portions)})` : ""));
  });
}

/** Stocktake: what's really there, in base units. */
export async function setStock(changes: { ingredientId: number; base: string; qty: number }[]): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    const list = z.array(z.object({ ingredientId: id, base: z.string().max(12), qty: z.number().min(0).max(1e9) })).min(1).max(500).parse(changes);
    await prisma.$transaction(list.map((c) => prisma.$executeRaw`INSERT INTO meals.pantry (ingredient_id, unit, qty)
      VALUES (${c.ingredientId}, ${c.base}, ${c.qty}::numeric) ON CONFLICT (ingredient_id, unit)
      DO UPDATE SET qty = EXCLUDED.qty, updated_at = now()`));
    return ok(`Pantry updated (${list.length} item${list.length === 1 ? "" : "s"})`);
  });
}

/** One more bottle, one roll used up: from what's there now. */
export async function adjustStock(ingredientId: number, base: string, delta: number): Promise<Result> {
  await requireUser();
  return attempt(async () => {
    await prisma.$transaction(async (tx) => addStock(tx, id.parse(ingredientId), z.string().max(12).parse(base),
      z.number().min(-1e6).max(1e6).parse(delta)));
    return ok(delta > 0 ? "One more" : "One used up");
  });
}

// ---- shopping --------------------------------------------------------------------------------------------------
// qty is in `base` (g, ml, pcs…), or, when `unit` is given instead, in that unit (2 crates, 1.5 kg): it's turned into
// the base unit here with the item's own containers, as the Python app does on the shopping page
const Line = z.object({ ingredientId: id.nullable(), name: z.string().max(60), qty: z.number().min(0).max(1e9),
  base: z.string().max(12).optional(), unit: z.string().max(12).optional(), price: z.number().min(0).max(1e8),
  category: z.string().max(50) }).refine((l) => l.base || l.unit, "Say what unit each amount is in.");

/** A shopping trip in one step: what was bought goes into the pantry, prices are remembered, and the cost is logged
 * as one expense per money category. */
export async function saveTrip(day: string, account: string, linesIn: z.input<typeof Line>[], shopIn: string | null)
  : Promise<Result<{ changes: [string, number, number, number][] }>> {
  const user = await requireUser();
  return attempt(async () => {
    const d = isoDate.parse(day);
    const parsed = z.array(Line).max(300).parse(linesIn).filter((l) => l.price > 0);
    const packs = await packsOf(prisma as unknown as Tx);
    const lines: TripLine[] = parsed.map((l) => {
      const [qty, base] = l.unit ? toBase(l.qty, l.unit, l.ingredientId ? packs.get(l.ingredientId) : null) : [l.qty, l.base!];
      return { ingredientId: l.ingredientId, name: l.name, qty, base, price: l.price, category: l.category };
    });
    if (!lines.length) return fail("Enter what you paid for at least one item.");
    if (!(await prisma.account.findUnique({ where: { name: account } }))) return fail("Pick one of your accounts.");
    const shop = (shopIn ?? "").trim().slice(0, 60) || null;
    const byCat = new Map<string, TripLine[]>();
    for (const l of lines) byCat.set(l.category, [...(byCat.get(l.category) ?? []), l]);
    const changes = await prisma.$transaction(async (tx) => {
      const old = new Map((await tx.priceKnown.findMany()).map((p) => [`${p.ingredientId}|${p.unit}`, Number(p.perUnit)]));
      const total = Math.round(lines.reduce((a, l) => a + l.price, 0) * 100) / 100;
      const trip = await tx.trip.create({ data: { date: fromISO(d), account, total, createdBy: user.username, shop } });
      for (const l of lines) {
        await tx.tripItem.create({ data: { tripId: trip.id, ingredientId: l.ingredientId, name: l.name, qty: l.qty, unit: l.base,
          price: l.price, category: l.category } });
        if (l.ingredientId && l.qty > 0) {
          await addStock(tx, l.ingredientId, l.base, l.qty);
          await tx.priceKnown.upsert({ where: { ingredientId_unit: { ingredientId: l.ingredientId, unit: l.base } },
            create: { ingredientId: l.ingredientId, unit: l.base, perUnit: l.price / l.qty },
            update: { perUnit: l.price / l.qty, updatedAt: new Date() } });
        }
      }
      for (const [cat, items] of byCat) {
        const names = items.slice(0, 4).map((i) => i.name).join(", ") + (items.length > 4 ? ` and ${items.length - 4} more` : "");
        await tx.transaction.create({ data: { date: fromISO(d), type: "Expense", category: cat,
          amount: Math.round(items.reduce((a, i) => a + i.price, 0) * 100) / 100,
          note: `Groceries${shop ? ` at ${shop}` : ""} (trip ${trip.id}): ${names}`, member: SHARED, account, createdBy: user.username } });
      }
      return priceChanges(lines, old);
    }, TIMEOUT);
    const split = [...byCat].map(([c, items]) => `${c} ${money(items.reduce((a, i) => a + i.price, 0))}`).join(", ");
    const total = lines.reduce((a, l) => a + l.price, 0);
    return ok(`Saved ${money(total)} of shopping${shop ? ` at ${shop}` : ""} from ${account}: ${split}`, { changes });
  });
}
