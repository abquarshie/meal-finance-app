import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { Empty } from "@/components/ui";
import { loadKitchen } from "@/lib/kitchen/load";
import { sk, unkey } from "@/lib/kitchen/logic";
import { baseOf, fmt, fmtStock, fromBase, isLoose, toBase } from "@/lib/kitchen/units";
import { money } from "@/lib/money";
import { PantryTable, type StockRow } from "./PantryTable";

export const metadata = { title: "Pantry" };

export default async function Pantry() {
  const k = await loadKitchen();
  const keys = new Set([...k.ingredients.map((i) => sk(i.id, baseOf(i.unit))), ...k.pantry.keys()]);
  const rows: StockRow[] = [...keys].map(unkey).filter(([ing]) => k.names.has(ing))
    .sort((a, b) => ((k.names.get(a[0]) ?? "").toLowerCase() < (k.names.get(b[0]) ?? "").toLowerCase() ? -1 : 1))
    .map(([ing, base]) => {
      const usual = k.unitOf.get(ing) ?? base;
      const unit = baseOf(usual) === base ? usual : base;
      const have = k.pantry.get(sk(ing, base)) ?? 0;
      const low = k.lowLevels.get(sk(ing, base));
      // only stocked items or ones with a warning level count as "out": the catalog's never-bought items aren't
      const tracked = k.pantry.has(sk(ing, base)) || low !== undefined;
      const status = have <= 0 ? (tracked ? "Out" : "") : low !== undefined && have <= low ? "Low" : "";
      const per = k.prices.get(sk(ing, base));
      const pack = k.pack(ing);
      return { ing, base, name: k.names.get(ing)!, unit, stock: Math.round(fromBase(have, base, unit) * 1000) / 1000,
        shelf: have > 0 ? fmtStock(have, base, pack, usual) : "", status, warn: low !== undefined ? fmt(low, base, usual) : "",
        price: per === undefined ? "" : pack && pack[2] === base && !isLoose(pack) ? `${money(per * pack[1])} / ${pack[0]}`
          : `${money(per * toBase(1, unit)[0])} / ${unit}`,
        perUnit: toBase(1, unit)[0] };
    });
  return (
    <>
      <KitchenHead current="/pantry" title="Pantry / Inventory" sub="What's in stock. Type a new number to correct it." />
      {rows.length ? <PantryTable rows={rows} /> : <div className="card"><Empty>No ingredients yet. Add them under Recipes.</Empty></div>}
    </>
  );
}
