// Read a mobile money text message (MTN MoMo, Telecel Cash, AT Money) into entry details. A port of core/momo.py.
// Networks word their messages differently, so this looks for the parts every message has (an amount in GHS, a fee,
// a balance, who the money went to or came from, a transaction ID) rather than one exact template.
import { MONTH_ABBR, today as todayISO, type ISODate } from "./dates";
import { CURRENCY } from "./money";

export type MomoFound = {
  kind: "Expense" | "Income" | "Transfer";
  direction: "out" | "in" | "cash_out" | "cash_in";
  amount: number; fee: number; balance: number | null; party: string; reference: string | null;
  txnId: string | null; date: ISODate | null; categoryHints: string[];
};

const MONEY = /(?:GHS|GH₵|GH¢|GHC|¢)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;

// words that suggest a category, matched against the family's own category names
const CATEGORY_HINTS: [RegExp, string[]][] = [
  [/\bairtime\b|\bcredit\b/, ["Telephone calls credit"]],
  [/\bdata\b|\bbundle\b|internet/, ["Internet Data"]],
  [/\becg\b|prepaid|electric|\bnedco\b/, ["Electricity"]],
  [/\bgwcl\b|ghana water/, ["Water for washing and bathing"]],
  [/\bgas\b|\blpg\b/, ["Gas"]],
  [/pharma|chemist|hospital|clinic/, ["Medications", "Hospital bills"]],
  [/uber|bolt|yango|trotro|taxi/, ["Other transport"]],
];
const MOMO_ACCOUNT = /momo|mobile money|\bmtn\b|telecel|vodafone|airtel|\bat money\b/i;
const INITIALISMS = new Set(["ECG", "NHIS", "UBA", "ABSA", "SIC", "GOIL", "ATM", "GRA", "VRA", "STC", "UPSA", "KNUST",
  "UG", "AT"]);

function num(text: string): number | null {
  const v = Number(text.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

function iso(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function monthNo(abbr: string): number {
  return MONTH_ABBR.findIndex((m) => m.toLowerCase() === abbr.toLowerCase()) + 1;
}

function findDate(t: string): ISODate | null {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const d = iso(+m[1], +m[2], +m[3]);
    if (d) return d;
  }
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t);
  if (m) {
    const d = iso(+m[3], +m[2], +m[1]);
    if (d) return d;
  }
  m = /\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\b/.exec(t);
  if (m && monthNo(m[2])) {
    const d = iso(+m[3], monthNo(m[2]), +m[1]);
    if (d) return d;
  }
  m = /\b(\d{1,2})-([A-Za-z]{3})-(\d{2})\b/.exec(t);
  if (m && monthNo(m[2])) {
    const yy = +m[3];
    const d = iso(yy < 69 ? 2000 + yy : 1900 + yy, monthNo(m[2]), +m[1]); // like Python's %y
    if (d) return d;
  }
  return null;
}

function isInitialism(word: string): boolean {
  const w = word.replace(/^[.,]+|[.,]+$/g, "");
  return INITIALISMS.has(w) || (w.length >= 2 && w.length <= 5 && /^[A-Za-z]+$/.test(w) && !/[AEIOU]/.test(w));
}

function title(w: string): string {
  return w.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

function strip(s: string, chars: string): string {
  const set = new Set(chars);
  let a = 0;
  let b = s.length;
  while (a < b && set.has(s[a])) a++;
  while (b > a && set.has(s[b - 1])) b--;
  return s.slice(a, b);
}

/** Who the money went to or came from: the words after "to"/"from" following the amount. */
function party(t: string, amountEnd: number): string {
  const m = /\b(?:to|from)\s+(.+?)(?=\s*(?:\.\s|,|\bcurrent\b|\bon\b|\bhas\b|\bat\b|\bwith\b|\breference\b|\bfee\b|\byour\b|\bnew balance\b|\.?$))/i
    .exec(t.slice(amountEnd));
  if (!m) return "";
  let name = strip(m[1], " .:-");
  name = name.replace(/^\+?\d[\d\s]{8,}\s*/, ""); // drop a leading phone number
  name = name.replace(/\s+/g, " ").trim();
  if (!name || /^\d+$/.test(name)) return "";
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  // KOFI MENSAH -> Kofi Mensah, but initialisms like ECG, MTN or GCB stay as they are
  return name.split(" ").map((w) => (isInitialism(w) ? w : title(w))).join(" ");
}

/** What was found, or null if this doesn't look like a money message. */
export function parseMomo(text: string): MomoFound | null {
  if (!text || !text.trim()) return null;
  const t = text.split(/\s+/).filter(Boolean).join(" ");
  const low = t.toLowerCase();

  let amount: number | null = null;
  let fee: number | null = null;
  let balance: number | null = null;
  let amountEnd = 0;
  let prevEnd = 0;
  for (const m of t.matchAll(MONEY)) {
    const start = m.index!;
    const before = low.slice(Math.max(prevEnd, start - 45), start);
    const value = num(m[1]);
    prevEnd = start + m[0].length;
    if (value === null) continue;
    if (before.includes("levy") || /\btax\b/.test(before)) fee = (fee ?? 0) + value;
    else if (before.includes("fee") || before.includes("charge")) fee = (fee ?? 0) + value;
    else if (before.includes("balance")) {
      if (balance === null) balance = value;
    } else if (amount === null) {
      amount = value;
      amountEnd = prevEnd;
    }
  }
  if (fee === null) { // some messages give the fee without "GHS", e.g. "TRANSACTION FEE: 0.50"
    const m = /fee[^0-9]{0,20}([0-9]+\.[0-9]{2})/.exec(low);
    if (m) fee = num(m[1]);
  }
  if (amount === null) return null;

  let kind: MomoFound["kind"] = "Expense";
  let direction: MomoFound["direction"] = "out";
  if (/cash ?out|withdrawal|withdrawn/.test(low)) [kind, direction] = ["Transfer", "cash_out"];
  else if (/cash ?in\b|deposit/.test(low)) [kind, direction] = ["Transfer", "cash_in"];
  else if (/\breceived\b|\bcredited\b|you have received/.test(low)) [kind, direction] = ["Income", "in"];

  let reference: string | null = null;
  let m = /reference:?\s*(.+?)(?=\s*(?:\.\s|\.?$|\btransaction\b|\bfinancial\b|\bfee\b))/i.exec(t);
  if (m && !["", "n/a", "na", "-", "none"].includes(strip(m[1], " .").toLowerCase())) reference = strip(m[1], " .");
  let txnId: string | null = null;
  m = /(?:financial\s+)?trans(?:action)?\.?\s*id:?\s*([A-Za-z0-9][A-Za-z0-9.]{3,})/i.exec(t)
    ?? /^\s*(\d{6,})\s+confirmed/i.exec(t);
  if (m) txnId = m[1].replace(/\.+$/, "");

  const categoryHints = CATEGORY_HINTS.filter(([re]) => re.test(low)).flatMap(([, names]) => names);
  return {
    kind, direction, amount, fee: fee ?? 0, balance, party: party(t, amountEnd), reference, txnId,
    date: findDate(t), categoryHints,
  };
}

/** One line saying what was read, for the person to check. */
export function describeMomo(f: MomoFound, now: ISODate = todayISO()): string {
  const what = { out: "Paid", in: "Received", cash_out: "Cash out", cash_in: "Cash in" }[f.direction];
  const amt = (x: number) => `${CURRENCY}${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let head = `${what} ${amt(f.amount)}`;
  if (f.party) head += (f.direction === "in" || f.direction === "cash_in" ? " from " : " to ") + f.party;
  const parts = [head];
  if (f.fee) parts.push(`fee ${amt(f.fee)}`);
  if (f.date && f.date !== now) {
    const [y, mo, d] = f.date.split("-");
    parts.push(`on ${d} ${MONTH_ABBR[+mo - 1]} ${y}`);
  }
  return parts.join(", ");
}

export function momoAccount(accountNames: string[]): string | null {
  return accountNames.find((n) => MOMO_ACCOUNT.test(n)) ?? null;
}
