import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Book, type BookData, type RuleRow, type TxRow } from "@/lib/book";
import { addMonths } from "@/lib/dates";
import { describeMomo, momoAccount, parseMomo } from "@/lib/momo";
import { catchUp, occurrence } from "@/lib/rules";
import { committedText } from "@/lib/words";

// What the Python app says, from tests/parity/python_fixtures.py
const py = JSON.parse(readFileSync(path.join(import.meta.dirname, "../fixtures/python.json"), "utf8"));
const DAY = "2026-10-20";

let nextId = 1;
function tx(p: Partial<TxRow>): TxRow {
  return { id: nextId++, date: DAY, type: "Expense", category: "Staples", amount: 0, note: "", member: "",
    account: "GCB", toAccount: "", createdBy: "", ...p };
}
function rule(p: Partial<RuleRow>): RuleRow {
  return { id: nextId++, name: "Rule", type: "Expense", amount: 0, fee: null, category: "Staples", account: "GCB",
    toAccount: "", member: "", note: "", frequency: "Monthly", startDate: "2026-10-25", nextDate: "2026-10-25",
    runCount: 0, endDate: null, active: true, lastRun: null, ...p };
}

/** One everyday account (GCB), one savings account (Susu), a Food budget of 1000 with `spent` used. */
function book(opts: { everyday: number; savings?: number; spent?: number | null; tx?: TxRow[]; rules?: RuleRow[] }) {
  const data: BookData = {
    tx: [...(opts.spent ? [tx({ amount: opts.spent, account: "GCB", category: "Staples" })] : []), ...(opts.tx ?? [])],
    categories: [
      { id: 1, name: "Staples", groupName: "Food", kind: "Expense" },
      { id: 2, name: "Dining Out", groupName: "Food", kind: "Expense" },
      { id: 3, name: "Internet Data", groupName: "Utility", kind: "Expense" },
      { id: 4, name: "Charges", groupName: "Other", kind: "Expense" },
      { id: 5, name: "Salary", groupName: "Income", kind: "Income" },
      { id: 6, name: "Susu", groupName: "Transfer", kind: "Transfer" },
    ],
    accounts: [{ id: 1, name: "GCB", openingBalance: opts.everyday + (opts.spent ?? 0), spendable: true },
      ...(opts.savings === undefined ? [] : [{ id: 2, name: "Susu", openingBalance: opts.savings, spendable: false }])],
    budgets: opts.spent === null ? [] : [{ category: "Food", monthlyLimit: 1000 }],
    rules: opts.rules ?? [], goals: [], contributions: [], users: [], features: {},
  };
  return new Book(data);
}

describe("the banner: only everyday money can be spent", () => {
  it.each([
    [800, 700, "ok", 300], // budgets are the limit
    [120, 700, "capped", 120], // only 120 in everyday accounts: savings don't top it up
    [-150, 700, "debt", -150], // overdrawn
    [0, 700, "empty", 0],
    [800, 1040, "over_budget", -40],
    [800, null, "no_budget", 800],
  ] as const)("everyday %d, spent %s → %s %d", (everyday, spent, state, left) => {
    const p = book({ everyday, savings: 5000, spent }).spendingPower(DAY);
    expect([p.state, p.left]).toEqual([state, left]);
    expect([p.savings, p.everyday, p.hasSavings, p.debt]).toEqual([5000, everyday, true, Math.max(-everyday, 0)]);
  });

  it("leaves out auto payments still due this month", () => {
    const susu = rule({ name: "Monthly Susu", type: "Transfer", amount: 300, account: "GCB", toAccount: "Susu",
      category: "Susu" });
    // budgets allow 900, but 300 of the 800 is already spoken for
    let p = book({ everyday: 800, savings: 5000, spent: 100, rules: [susu] }).spendingPower(DAY);
    expect([p.state, p.left, p.committed]).toEqual(["capped", 500, 300]);
    // the Susu transfer will take more than is there
    p = book({ everyday: 200, savings: 5000, spent: 100, rules: [susu] }).spendingPower(DAY);
    expect([p.state, p.left]).toEqual(["committed", -100]);
    // a data bundle still to come uses 60 of the budgets (and of the money)
    const data = rule({ name: "Data bundle", amount: 60, category: "Dining Out" });
    p = book({ everyday: 2000, savings: 5000, spent: 700, rules: [data] }).spendingPower(DAY);
    expect([p.state, p.left, p.budget?.committed]).toEqual(["ok", 240, 60]);
    // auto income isn't counted, a fee on a move between everyday accounts is, and paused rules aren't
    const salary = rule({ type: "Income", amount: 5000, category: "Salary" });
    const paused = rule({ amount: 999, active: false });
    p = book({ everyday: 800, savings: 5000, spent: null, rules: [salary, paused] }).spendingPower(DAY);
    expect([p.state, p.left, p.committed]).toEqual(["no_budget", 800, 0]);
  });

  it("names each payment under the banner", () => {
    expect(committedText({ committed: 620, committedItems: [
      { name: "Monthly Susu", date: "2026-10-19", amount: 500 }, { name: "Data bundle", date: "2026-10-19", amount: 60 },
      { name: "Data bundle", date: "2026-10-26", amount: 60 }] }))
      .toBe("After GH₵620.00 set aside for auto payments still to come this month: Monthly Susu (Mon 19), "
        + "Data bundle (Mon 19, Mon 26).");
    expect(committedText({ committed: 0, committedItems: [] })).toBe("");
  });

  it("counts a weekly rule once for each run left this month", () => {
    const b = book({ everyday: 1000, spent: 0, rules: [rule({ name: "Data", amount: 25, frequency: "Weekly",
      startDate: "2026-10-06", runCount: 3, category: "Internet Data" })] });
    expect(b.committed(DAY).items.map((i) => i.date)).toEqual(["2026-10-27"]);
  });
});

describe("budgets", () => {
  it("a category budget inside a group with its own budget isn't counted twice", () => {
    const b = new Book({ ...emptyData(), budgets: [{ category: "Food", monthlyLimit: 1000 },
      { category: "Dining Out", monthlyLimit: 200 }],
      tx: [tx({ category: "Dining Out", amount: 150 }), tx({ category: "Staples", amount: 100 })] });
    expect(b.budgetStatus("2026-10").map((s) => [s.name, s.spent, s.isGroup])).toEqual([
      ["Dining Out", 150, false], ["Food", 250, true]]);
    expect(b.budgetTotal("2026-10")).toEqual({ limit: 1000, spent: 250, left: 750 });
  });
});

function emptyData(): BookData {
  return { tx: [], categories: [{ id: 1, name: "Staples", groupName: "Food", kind: "Expense" },
    { id: 2, name: "Dining Out", groupName: "Food", kind: "Expense" }],
  accounts: [{ id: 1, name: "GCB", openingBalance: 0, spendable: true }], budgets: [], rules: [], goals: [],
  contributions: [], users: [], features: {} };
}

describe("auto transaction dates match the Python app", () => {
  it.each(py.occurrence.map((o: any) => [o.start, o.freq, o]) as [string, string, any][])("%s %s", (start, freq, o) => {
    expect(o.runs.map((_: string, n: number) => occurrence(start, freq, n))).toEqual(o.runs);
    expect(catchUp(start, freq, 0, DAY)).toBe(o.catch_up);
  });
  it("31 January plus a month is the end of February", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("MoMo texts are read like the Python app reads them", () => {
  it.each(py.momo.map((m: any, i: number) => [i, m]) as [number, any][])("text %i", (_i, m) => {
    const f = parseMomo(m.text);
    if (m.found === null) {
      expect(f).toBeNull();
      return;
    }
    const want = m.found;
    expect(f).toEqual({ kind: want.kind, direction: want.direction, amount: want.amount, fee: want.fee,
      balance: want.balance, party: want.party, reference: want.reference, txnId: want.txn_id, date: want.date,
      categoryHints: want.category_hints });
    expect(describeMomo(f!, DAY)).toBe(want.describe);
  });
  it("finds the MoMo account by name", () => {
    expect(momoAccount(["Cash", "GCB", "MTN MoMo"])).toBe("MTN MoMo");
    expect(momoAccount(["Cash", "GCB"])).toBeNull();
  });
});

describe("passwords and sessions work across both apps", async () => {
  const { checkPassword, hashPassword, tokenHash } = await import("@/lib/auth");
  it("a password set in the Python app signs in here", async () => {
    expect(await checkPassword(py.password.plain, py.password.hash)).toBe(true);
    expect(await checkPassword("kenkey and fish", py.password.hash)).toBe(false);
  });
  it("hashes in the same format", async () => {
    const h = await hashPassword("Kenkey and fish");
    expect(h).toMatch(/^pbkdf2_sha256\$600000\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/);
    expect(await checkPassword("Kenkey and fish", h)).toBe(true);
  });
  it("hashes session tokens the same way", () => {
    expect(tokenHash("abc123")).toBe(py.token_hash);
  });
});

describe("rounding like Python", async () => {
  const { round } = await import("@/lib/kitchen/logic");
  it("rounds the exact binary value, ties to even", () => {
    expect([round(0.125, 2), round(0.375, 2), round(13.005, 2), round(182.07 / 14, 2), round(2.5, 0), round(3.5, 0), round(-1.125, 2), round(1.005, 2)])
      .toEqual([0.12, 0.38, 13.01, 13, 2, 4, -1.12, 1]); // the same as Python
  });
});
