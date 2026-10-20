// The same as tests/parity/catalog_scenario.py, by this app. Runs when CATALOG_DB is set.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: 1, username: "ama", name: "Ama", isOwner: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const url = process.env.CATALOG_DB;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("the starter lists and catalog", () => {
  it("are added", async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.$executeRaw`DELETE FROM meals.recipes WHERE name IN ('Okra soup', 'Fufu')`;
    await prisma.$executeRaw`DELETE FROM meals.pairings WHERE name LIKE 'Fufu%'`;
    await prisma.$executeRaw`UPDATE meals.ingredients SET section = NULL WHERE name = 'Yam'`;
    const r = await import("@/actions/recipes");
    for (const x of [await r.addStarterRecipes(), await r.addCatalog()]) expect(x.ok).toBe(true);
  }, 60_000);
});
