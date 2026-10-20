// Units of measure for ingredients: a port of meals/units.py.
//
// Weights and volumes convert (500 g + 1 kg = 1.5 kg). Counted things ("3 onions", "2 tins") stay as they are.
// Every quantity is stored in a base unit: g, ml, or the count word itself. Cups, tbsp and tsp are volumes (ml)
// but are shown back in the cook's own measure. An item can have a container it's bought in (a crate of 30 eggs),
// be "sold loose" (onions by the piece though the bag holds 40), and have other units ({container: 400}).

export const WEIGHT: Record<string, number> = { g: 1, kg: 1000 };
export const VOLUME: Record<string, number> = { ml: 1, l: 1000, cup: 250, tbsp: 15, tsp: 5 };
export const COUNTS = ["pcs", "tin", "sachet", "bunch", "bag", "bottle", "loaf", "tray", "ball", "teabag", "slice", "finger",
  "clove"];
export const KITCHEN = ["cup", "tbsp", "tsp"];
export const CONTAINERS = ["crate", "bag", "bottle", "can", "tin", "pack", "packet", "sachet", "box", "jar", "tray", "bunch",
  "loaf", "ball", "carton", "gallon", "bucket", "olonka", "tub", "pouch", "basket", "thumb", "bulb", "set", "tuber",
  "bundle", "kilo", "container"];
export const UNITS = [...Object.keys(WEIGHT), ...Object.keys(VOLUME), ...new Set([...COUNTS, ...CONTAINERS])];
export const LEFTOVER_UNITS = ["portion", "serving", "bowl", "plate", "container"];

const IRREGULAR: Record<string, string> = { loaf: "loaves", pcs: "pcs", olonka: "olonkas" };
const NO_PLURAL = new Set(["g", "kg", "ml", "l", "tbsp", "tsp", "pcs"]);

/** A container: [name, size in base units, base unit, sold loose, {other unit: size in base units}] */
export type Pack = [string, number, string, boolean, Record<string, number>];

export function plural(word: string, n = 2): string {
  if ((n > 0 && n <= 1 + 1e-9) || NO_PLURAL.has(word)) return word; // 1 crate, ½ crate, 2 crates, 3 cups, 2 tbsp
  if (word in IRREGULAR) return IRREGULAR[word];
  if (/(ch|sh|x|s)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** The unit a quantity is stored and added up in. */
export function baseOf(unit: string | null | undefined): string {
  if (unit && unit in WEIGHT) return "g";
  if (unit && unit in VOLUME) return "ml";
  return unit || "pcs";
}

export function makePack(unit: string, packName: string | null, packSize: number | null, looseToo = false,
  altUnits: unknown = null): Pack | null {
  const size = packSize === null || packSize === undefined ? 0 : Number(packSize);
  if (!packName || !size || Number.isNaN(size) || size <= 0) return null;
  const alts = altUnits && typeof altUnits === "object" && !Array.isArray(altUnits)
    ? Object.fromEntries(Object.entries(altUnits as Record<string, unknown>).map(([k, v]) => [k, Number(v)])) : {};
  return [packName, size, baseOf(unit), Boolean(looseToo), alts];
}

export function isLoose(pack: Pack | null | undefined): boolean {
  return Boolean(pack && pack[3]);
}

export function alts(pack: Pack | null | undefined): Record<string, number> {
  return pack ? pack[4] ?? {} : {};
}

/** The few units that make sense for one item: rice in kg offers kg, g and its bag; eggs offer pcs and the crate. */
export function unitsFor(unit: string, pack?: Pack | null): string[] {
  const base = baseOf(unit);
  let out: string[];
  if (base === "g") out = unit === "kg" ? ["kg", "g"] : ["g", "kg"];
  else if (base === "ml") out = [unit, ...Object.keys(VOLUME).filter((u) => u !== unit)];
  else out = [unit || "pcs"];
  for (const extra of Object.keys(alts(pack))) if (!out.includes(extra)) out.push(extra);
  if (pack && pack[0] && !out.includes(pack[0])) out.unshift(pack[0]);
  return out;
}

/** [quantity in base unit, base unit]. 2 crates of eggs -> [60, "pcs"]. */
export function toBase(qty: number, unit: string | null | undefined, pack?: Pack | null): [number, string] {
  if (pack && unit === pack[0] && pack[1]) return [qty * pack[1], pack[2]];
  if (pack && unit && unit in alts(pack)) return [qty * alts(pack)[unit], pack[2]];
  if (unit && unit in WEIGHT) return [qty * WEIGHT[unit], "g"];
  if (unit && unit in VOLUME) return [qty * VOLUME[unit], "ml"];
  return [qty, unit || "pcs"];
}

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1.0 -> "1", 1.5 -> "1.5", 0.333 -> "0.33" (like Python's f"{x:,.2f}" with trailing zeros stripped). */
export function num(x: number): string {
  const s = pyRound2(x).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

/** Python's f"{x:,.2f}": rounds half to even on the exact binary value, with thousands separators. */
function pyRound2(x: number): string {
  // toFixed rounds the exact binary value like Python does, except at an exact tie (0.125), where Python goes to
  // the even digit ("0.12") and toFixed goes up ("0.13")
  const y = Math.abs(x) * 100;
  const fl = Math.floor(y);
  const fixed = y - fl === 0.5 ? `${x < 0 ? "-" : ""}${((fl % 2 === 0 ? fl : fl + 1) / 100).toFixed(2)}` : x.toFixed(2);
  const [w, f] = fixed.split(".");
  const neg = w.startsWith("-");
  return `${neg ? "-" : ""}${grouped.format(Math.abs(Number(w)))}.${f}`;
}

const FRACTIONS: [number, string][] = [[0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]];

/** Counts and portions the way people say them: 1.5 -> "1½", 0.25 -> "¼", 3 -> "3", 1.2 -> "1.2". */
export function frac(x: number | null | undefined): string {
  if (x === null || x === undefined) return "";
  const whole = Math.floor(x + 1e-9);
  const rest = x - whole;
  if (rest < 0.01) return grouped.format(whole);
  for (const [value, sign] of FRACTIONS) {
    if (Math.abs(rest - value) < 0.01) return (whole ? grouped.format(whole) : "") + sign;
  }
  return num(x);
}

/** A stored quantity in the most natural unit: 1500 g -> "1.5 kg", 3 pcs -> "3", 750 ml of rice in cups -> "3 cups". */
export function fmt(qty: number | null | undefined, base: string, usual?: string | null): string {
  if (qty === null || qty === undefined) return "";
  if (usual && KITCHEN.includes(usual) && base === "ml") {
    const n = qty / VOLUME[usual];
    return `${frac(n)} ${plural(usual, n)}`;
  }
  if (base === "g") return Math.abs(qty) >= 1000 ? `${num(qty / 1000)} kg` : `${num(qty)} g`;
  if (base === "ml") return Math.abs(qty) >= 1000 ? `${num(qty / 1000)} l` : `${num(qty)} ml`;
  if (base === "pcs") return frac(qty);
  return `${frac(qty)} ${plural(base, qty)}`;
}

/** A quantity the way it sits on the shelf: "1 crate + 6", "1.5 bags (7.5 kg)", "2 bottles". */
export function fmtStock(qty: number, base: string, pack?: Pack | null, usual?: string | null): string {
  if (!pack || !pack[1] || pack[2] !== base || qty < pack[1] - 1e-9) return fmt(qty, base, usual);
  const [name, size] = pack;
  if (base === "g" || base === "ml") {
    const n = qty / size;
    return `${num(n)} ${plural(name, n)} (${fmt(qty, base, usual)})`;
  }
  const whole = Math.floor(qty / size + 1e-9);
  const rest = qty - whole * size;
  return `${whole} ${plural(name, whole)}` + (rest > 1e-9 ? ` + ${fmt(rest, base)}` : "");
}

/** Whole containers needed to cover qty (base unit): 12 eggs with crates of 30 -> 1. */
export function packsFor(qty: number, pack: Pack | null | undefined): number | null {
  if (!pack || !pack[1]) return null;
  return Math.max(Math.ceil(qty / pack[1] - 1e-9), 1);
}

/** A stored quantity in the unit someone typed it in. */
export function fromBase(qty: number, base: string, unit: string, pack?: Pack | null): number {
  if (pack && unit === pack[0] && pack[1] && pack[2] === base) return qty / pack[1];
  if (pack && unit in alts(pack) && pack[2] === base) return qty / alts(pack)[unit];
  if (unit in WEIGHT && base === "g") return qty / WEIGHT[unit];
  if (unit in VOLUME && base === "ml") return qty / VOLUME[unit];
  return qty;
}
