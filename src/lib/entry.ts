import "server-only";
import type { Book } from "./book";
import { today } from "./dates";
import { KINDS, type Kind } from "./money";
import { momoAccount } from "./momo";

/** What the Add entry form needs to pick sensible defaults: sent to the browser once per page. */
export type EntryContext = {
  today: string;
  accounts: string[];
  balances: Record<string, number>;
  categories: Record<Kind, string[]>;
  labels: Record<string, string>;
  top: Record<Kind, string[]>;
  defaultCategory: Record<Kind, string | null>;
  defaultAccount: Record<Kind, string | null>;
  defaultTo: string | null;
  last: Record<string, number>; // "Expense|Staples" -> the amount entered last time
  members: string[];
  momoAccount: string | null;
};

export function entryContext(b: Book): EntryContext {
  const now = today();
  const by = <T,>(f: (k: Kind) => T) => Object.fromEntries(KINDS.map((k) => [k, f(k)])) as Record<Kind, T>;
  const last: Record<string, number> = {};
  for (const t of b.manual) {
    const key = `${t.type}|${t.category}`;
    if (!(key in last)) last[key] = t.amount;
  }
  return {
    today: now,
    accounts: b.accountNames,
    balances: Object.fromEntries(b.balances()),
    categories: by((k) => b.categoryNames(k)),
    labels: Object.fromEntries(b.categoryNames().map((c) => [c, b.catLabel(c)])),
    top: by((k) => b.topCategories(k, 6, now)),
    defaultCategory: by((k) => b.defaultCategory(k)),
    defaultAccount: by((k) => b.defaultAccount(k)),
    defaultTo: b.defaultAccount("Transfer", "toAccount"),
    last,
    members: b.members(),
    momoAccount: momoAccount(b.accountNames),
  };
}
