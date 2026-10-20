import type { Book, Tx } from "./book";
import { monthOf, today } from "./dates";
import { KINDS, type Kind } from "./money";

export type TxFilter = { month: string; kinds: Kind[]; q: string };

/** The filters from the address: ?month=2026-10&type=Expense,Income&q=makola */
export function readFilter(b: Book, sp: { month?: string; type?: string; q?: string }): TxFilter {
  const months = [...new Set(b.tx.map((t) => t.month))].sort().reverse();
  const now = monthOf(today());
  const month = sp.month === "all" || (sp.month && months.includes(sp.month)) ? sp.month
    : months.includes(now) ? now : months[0] ?? now;
  const kinds = (sp.type ?? "").split(",").filter((k): k is Kind => (KINDS as readonly string[]).includes(k));
  return { month, kinds, q: (sp.q ?? "").trim().slice(0, 100) };
}

export function applyFilter(b: Book, f: TxFilter): Tx[] {
  const q = f.q.toLowerCase();
  return b.tx.filter((t) => (f.month === "all" || t.month === f.month)
    && (!f.kinds.length || f.kinds.includes(t.type))
    && (!q || [t.note, t.category, t.group, t.member].some((x) => x.toLowerCase().includes(q))));
}
