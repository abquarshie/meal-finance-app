export const CURRENCY = "GH₵";
export const SHARED = "Household"; // used when a transaction isn't tied to one family member
export const KINDS = ["Expense", "Income", "Transfer"] as const;
export type Kind = (typeof KINDS)[number];
export const FREQUENCIES = ["Weekly", "Every 2 weeks", "Monthly", "Yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FEE_CATEGORY = "Charges";
export const AUTO_PREFIX = "Auto · ";
export const FEE_PREFIX = "Fee · ";

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** GH₵1,234.50, −GH₵20.00, or with signed=true +GH₵20.00 */
export function money(x: number, signed = false): string {
  const sign = signed ? (x < 0 ? "−" : "+") : x < 0 ? "−" : "";
  return `${sign}${CURRENCY}${fmt.format(Math.abs(round2(x)))}`;
}

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function cleanNote(note: string): string {
  for (const p of [AUTO_PREFIX, FEE_PREFIX]) if (note.startsWith(p)) return note.slice(p.length);
  return note;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isKind(x: unknown): x is Kind {
  return typeof x === "string" && (KINDS as readonly string[]).includes(x);
}

export function isFrequency(x: unknown): x is Frequency {
  return typeof x === "string" && (FREQUENCIES as readonly string[]).includes(x);
}
