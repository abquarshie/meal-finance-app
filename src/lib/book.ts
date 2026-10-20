// Everything the pages ask of the family's money, worked out from plain rows. No database access here, so it can
// be tested on its own. A line-by-line port of core/data.py's Book, so both apps show the same figures.
import {
  addDays, addMonthsToKey, dayOfMonth, monthEnd, monthOf, today as todayISO, type ISODate, type MonthKey,
} from "./dates";
import { AUTO_PREFIX, FEE_CATEGORY, FEE_PREFIX, KINDS, round2, SHARED, type Kind } from "./money";
import { occurrence } from "./rules";

export type TxRow = {
  id: number; date: ISODate; type: Kind; category: string; amount: number; note: string; member: string;
  account: string; toAccount: string; createdBy: string;
};
export type Tx = TxRow & { month: MonthKey; group: string; isAuto: boolean; isFee: boolean };
export type CategoryRow = { id: number; name: string; groupName: string; kind: Kind };
export type AccountRow = { id: number; name: string; openingBalance: number; spendable: boolean };
export type BudgetRow = { category: string; monthlyLimit: number };
export type RuleRow = {
  id: number; name: string; type: Kind; amount: number; fee: number | null; category: string; account: string;
  toAccount: string; member: string; note: string; frequency: string; startDate: ISODate; nextDate: ISODate;
  runCount: number; endDate: ISODate | null; active: boolean; lastRun: ISODate | null;
};
export type GoalRow = { id: number; name: string; target: number; deadline: ISODate | null; saved: number };
export type ContributionRow = {
  id: number; date: ISODate; goalId: number; goal: string; amount: number; note: string; createdBy: string;
};
export type UserRow = {
  id: number; username: string; displayName: string; isOwner: boolean; lastLogin: string | null; createdAt: string;
};

export type BookData = {
  tx: TxRow[]; categories: CategoryRow[]; accounts: AccountRow[]; budgets: BudgetRow[]; rules: RuleRow[];
  goals: GoalRow[]; contributions: ContributionRow[]; users: UserRow[]; features: Record<string, string>;
};

export type BudgetStatus = { name: string; limit: number; spent: number; pct: number; isGroup: boolean };
export type Committed = { cash: number; budget: number; items: { name: string; date: ISODate; amount: number }[] };
export type SpendingState = "debt" | "empty" | "committed" | "over_budget" | "capped" | "ok" | "no_budget";
export type SpendingPower = {
  left: number; state: SpendingState; everyday: number; savings: number; hasSavings: boolean; debt: number;
  budget: { limit: number; spent: number; left: number; committed: number } | null;
  committed: number; committedItems: Committed["items"]; free: number;
};

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export class Book {
  readonly tx: Tx[]; // newest first
  readonly categories: CategoryRow[];
  readonly accounts: AccountRow[];
  readonly budgets: BudgetRow[];
  readonly rules: RuleRow[];
  readonly goals: GoalRow[];
  readonly contributions: ContributionRow[];
  readonly users: UserRow[];
  readonly groupOf: Map<string, string>;
  readonly kindOf: Map<string, Kind>;
  readonly groups: string[];
  readonly accountNames: string[];
  readonly nameOfUser: Map<string, string>;
  private readonly features: Record<string, string>;
  private cache = new Map<string, unknown>();

  constructor(d: BookData) {
    this.categories = [...d.categories].sort((a, b) => a.id - b.id);
    this.accounts = [...d.accounts].sort((a, b) => a.id - b.id);
    this.budgets = [...d.budgets].sort((a, b) => a.category.localeCompare(b.category));
    this.rules = [...d.rules].sort((a, b) => a.id - b.id);
    this.goals = [...d.goals].sort((a, b) => a.id - b.id);
    this.contributions = [...d.contributions].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    this.users = [...d.users].sort((a, b) => a.id - b.id);
    this.features = d.features;
    this.groupOf = new Map(this.categories.map((c) => [c.name, c.groupName]));
    this.kindOf = new Map(this.categories.map((c) => [c.name, c.kind]));
    this.groups = [...new Set(this.categories.map((c) => c.groupName))];
    this.accountNames = this.accounts.map((a) => a.name);
    this.nameOfUser = new Map(this.users.map((u) => [u.username, u.displayName]));
    this.tx = d.tx
      .map((t) => ({
        ...t,
        member: t.member || SHARED,
        month: monthOf(t.date),
        group: this.groupOf.get(t.category) ?? t.category,
        isAuto: t.note.startsWith(AUTO_PREFIX),
        isFee: t.note.startsWith(FEE_PREFIX),
      }))
      .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  }

  private memo<T>(key: string, make: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key) as T;
  }

  /** Parts of the app that can be switched off in Settings. On unless turned off. */
  feature(name: string): boolean {
    return this.features[`feature_${name}`] !== "off";
  }

  // ---- categories ------------------------------------------------------------------------------------------
  /** Category names in the order they were set up, kept together by group. */
  categoryNames(kind?: Kind): string[] {
    return this.memo(`cats:${kind ?? ""}`, () => {
      const list = kind ? this.categories.filter((c) => c.kind === kind) : this.categories;
      const byGroup = new Map<string, string[]>();
      for (const c of list) {
        if (!byGroup.has(c.groupName)) byGroup.set(c.groupName, []);
        byGroup.get(c.groupName)!.push(c.name);
      }
      return [...byGroup.values()].flat();
    });
  }

  catLabel(name: string): string {
    const g = this.groupOf.get(name);
    return g && g !== name ? `${g} › ${name}` : name;
  }

  /** Entries people typed in themselves (not auto entries or fees): the basis for smart defaults. */
  get manual(): Tx[] {
    return this.memo("manual", () => this.tx.filter((t) => !t.isAuto && !t.isFee));
  }

  /** The categories used most for this type over the last 90 days, then the rest in set-up order. */
  topCategories(kind: Kind, n = 6, now: ISODate = todayISO()): string[] {
    const names = this.categoryNames(kind);
    const since = addDays(now, -90);
    const counts = new Map<string, number>();
    for (const t of this.manual) {
      if (t.type === kind && t.date >= since) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    // like pandas value_counts: most used first, ties in the order first seen (newest first)
    const ranked = [...counts.entries()].map(([c, k], i) => ({ c, k, i }))
      .sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.c).filter((c) => names.includes(c));
    return [...ranked, ...names.filter((c) => !ranked.includes(c))].slice(0, n);
  }

  defaultCategory(kind: Kind): string | null {
    return this.topCategories(kind, 1)[0] ?? null;
  }

  /** What was last entered for this category, for the one-tap "Same as last time" button. */
  lastAmount(kind: Kind, category: string): number | null {
    const hit = this.manual.find((t) => t.type === kind && t.category === category);
    return hit ? hit.amount : null;
  }

  // ---- people and accounts -----------------------------------------------------------------------------------
  members(): string[] {
    const others = [...new Set(this.tx.map((t) => t.member))].filter((m) => m !== SHARED).sort();
    return [SHARED, ...others];
  }

  get multiMember(): boolean {
    return new Set(this.tx.map((t) => t.member)).size > 1;
  }

  balances(): Map<string, number> {
    return this.memo("balances", () => {
      const bal = new Map(this.accounts.map((a) => [a.name, a.openingBalance]));
      const add = (name: string, x: number) => {
        if (bal.has(name)) bal.set(name, bal.get(name)! + x);
      };
      for (const t of this.tx) {
        if (t.type === "Income") add(t.account, t.amount);
        else if (t.type === "Expense") add(t.account, -t.amount);
        else {
          add(t.account, -t.amount);
          add(t.toAccount, t.amount);
        }
      }
      for (const [k, v] of bal) bal.set(k, round2(v));
      return bal;
    });
  }

  balance(account: string): number {
    return this.balances().get(account) ?? 0;
  }

  /** Income and expense entries with no account (from before accounts existed). */
  get unassigned(): number {
    return this.tx.filter((t) => t.account === "" && t.type !== "Transfer").length;
  }

  /** The account last used for this type of entry, so the usual choice is already picked. */
  defaultAccount(kind: Kind, col: "account" | "toAccount" = "account"): string | null {
    const used = this.manual.filter((t) => t.type === kind && t[col] !== "").slice(0, 20);
    for (const t of used) if (this.accountNames.includes(t[col])) return t[col];
    if (col === "account" && this.accountNames.includes("Cash")) return "Cash";
    return this.accountNames[0] ?? null;
  }

  get everydayAccounts(): string[] {
    return this.accounts.filter((a) => a.spendable).map((a) => a.name);
  }

  // ---- months ------------------------------------------------------------------------------------------------
  /** Months with entries, newest first, always including this month. */
  months(now: ISODate = todayISO()): MonthKey[] {
    return [...new Set([...this.tx.map((t) => t.month), monthOf(now)])].sort().reverse();
  }

  /** [income, expenses] for a month. uptoDay=12 counts only the 1st to the 12th, so this month so far can be
   * compared fairly with the same days of last month. */
  monthTotals(period: MonthKey, uptoDay?: number): [number, number] {
    let inc = 0;
    let exp = 0;
    for (const t of this.tx) {
      if (t.month !== period || (uptoDay !== undefined && dayOfMonth(t.date) > uptoDay)) continue;
      if (t.type === "Income") inc += t.amount;
      else if (t.type === "Expense") exp += t.amount;
    }
    return [round2(inc), round2(exp)];
  }

  monthExpenses(period: MonthKey): Tx[] {
    return this.tx.filter((t) => t.month === period && t.type === "Expense");
  }

  /** Each budget with what was spent in that month, worst first. */
  budgetStatus(period: MonthKey): BudgetStatus[] {
    return this.memo(`budget:${period}`, () => {
      if (!this.budgets.length) return [];
      const byGroup = new Map<string, number>();
      const byCat = new Map<string, number>();
      for (const t of this.monthExpenses(period)) {
        byGroup.set(t.group, (byGroup.get(t.group) ?? 0) + t.amount);
        byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
      }
      const groups = new Set(this.groups);
      const out = this.budgets.map((b) => {
        const isGroup = groups.has(b.category);
        const spent = round2((isGroup ? byGroup : byCat).get(b.category) ?? 0);
        const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
        return { name: b.category, limit: b.monthlyLimit, spent, pct, isGroup };
      });
      return out.sort((a, b) => b.pct - a.pct); // stable, like pandas' sort
    });
  }

  /** All of a month's budgets added up, or null when none are set. A category budget inside a group that has its
   * own budget is left out, so nothing is counted twice. */
  budgetTotal(period: MonthKey): { limit: number; spent: number; left: number } | null {
    const status = this.budgetStatus(period);
    if (!status.length) return null;
    const groups = new Set(status.filter((s) => s.isGroup).map((s) => s.name));
    const counted = status.filter((s) => s.isGroup || !groups.has(this.groupOf.get(s.name) ?? ""));
    const limit = sum(counted.map((s) => s.limit));
    const spent = sum(counted.map((s) => s.spent));
    return { limit: round2(limit), spent: round2(spent), left: round2(limit - spent) };
  }

  /** Auto transactions still to come this month (not yet added), and what they'll take out of the everyday
   * accounts and off this month's budgets. Auto income isn't counted: money that hasn't arrived can't be spent. */
  committed(now: ISODate = todayISO()): Committed {
    const out: Committed = { cash: 0, budget: 0, items: [] };
    const period = monthOf(now);
    const end = monthEnd(period);
    const everyday = new Set(this.everydayAccounts);
    const status = this.budgetStatus(period);
    const groups = new Set(status.filter((s) => s.isGroup).map((s) => s.name));
    const cats = new Set(status.filter((s) => !s.isGroup).map((s) => s.name));
    const budgeted = (c: string) => groups.has(this.groupOf.get(c) ?? "") || cats.has(c);

    for (const r of this.rules.filter((r) => r.active)) {
      const fee = r.fee ?? 0;
      let n = r.runCount;
      let guard = 0;
      let d = occurrence(r.startDate, r.frequency, n);
      while (d <= end && (r.endDate === null || d <= r.endDate) && guard < 60) {
        let cash = 0;
        const outOf = everyday.has(r.account);
        const into = everyday.has(r.toAccount);
        if (r.type === "Expense") {
          cash = outOf ? r.amount : 0;
          if (budgeted(r.category)) out.budget += r.amount;
        } else if (r.type === "Transfer") {
          cash = outOf && !into ? r.amount + fee : outOf ? fee : 0;
          if (fee && budgeted(FEE_CATEGORY)) out.budget += fee;
        }
        if (cash) {
          out.cash += cash;
          out.items.push({ name: r.name, date: d, amount: cash });
        }
        n += 1;
        guard += 1;
        d = occurrence(r.startDate, r.frequency, n);
      }
    }
    out.cash = round2(out.cash);
    out.budget = round2(out.budget);
    out.items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }

  /** What can really be spent this month: the budgets that are left, but never more than the everyday accounts
   * hold, after the auto payments still due this month. Savings accounts are never counted. */
  spendingPower(now: ISODate = todayISO()): SpendingPower {
    const bal = this.balances();
    const everydayNames = new Set(this.everydayAccounts);
    let everyday = 0;
    let savings = 0;
    for (const [n, v] of bal) {
      if (everydayNames.has(n)) everyday += v;
      else savings += v;
    }
    everyday = round2(everyday);
    savings = round2(savings);
    const hasSavings = [...bal.keys()].some((n) => !everydayNames.has(n));
    const c = this.committed(now);
    const free = round2(everyday - c.cash);
    const total = this.budgetTotal(monthOf(now));
    const budget = total ? { ...total, left: round2(total.left - c.budget), committed: c.budget } : null;
    const base = { everyday, savings, hasSavings, debt: Math.max(-everyday, 0), budget, committed: c.cash,
      committedItems: c.items, free };
    if (everyday < 0) return { ...base, state: "debt", left: everyday };
    if (everyday === 0) return { ...base, state: "empty", left: 0 };
    if (free <= 0) return { ...base, state: "committed", left: free };
    if (budget === null) return { ...base, state: "no_budget", left: free };
    if (budget.left < 0) return { ...base, state: "over_budget", left: budget.left };
    if (budget.left > free) return { ...base, state: "capped", left: free };
    return { ...base, state: "ok", left: budget.left };
  }

  /** The next auto entry due, or null. */
  nextAuto(): RuleRow | null {
    const active = this.rules.filter((r) => r.active)
      .sort((a, b) => (a.nextDate === b.nextDate ? a.id - b.id : a.nextDate < b.nextDate ? -1 : 1));
    return active[0] ?? null;
  }

  /** True when an auto transaction is due, so the database is only asked when there's work to do. */
  autoDue(now: ISODate = todayISO()): boolean {
    return this.rules.some((r) => r.active && r.nextDate <= now);
  }
}

/** Budgets this entry pushes near or over the limit, as one line each. */
export function budgetAlerts(b: Book, kind: Kind, category: string, amount: number, date: ISODate,
  money: (x: number) => string): string[] {
  if (kind !== "Expense") return [];
  const out: string[] = [];
  for (const s of b.budgetStatus(monthOf(date))) {
    if (!(s.name === category || (s.isGroup && b.groupOf.get(category) === s.name)) || s.limit <= 0) continue;
    const before = (s.spent / s.limit) * 100;
    const after = ((s.spent + amount) / s.limit) * 100;
    if (after > 100) out.push(`${s.name} is ${money(s.spent + amount - s.limit)} over its ${money(s.limit)} budget`);
    else if ((after >= 75 && before < 75) || (after >= 90 && before < 90)) {
      out.push(`${s.name} is now at ${after.toFixed(0)}% of its ${money(s.limit)} budget`);
    }
  }
  return out;
}

/** Active, Paused (switched off by hand) or Finished (ran past its stop date). */
export function ruleStatus(r: RuleRow): ["Active" | "Paused" | "Finished", "in" | "warn" | "neutral"] {
  if (r.active) return ["Active", "in"];
  return r.endDate && r.nextDate > r.endDate ? ["Finished", "neutral"] : ["Paused", "warn"];
}

export function previousMonth(k: MonthKey): MonthKey {
  return addMonthsToKey(k, -1);
}

export { KINDS };
