// Dates are kept as "YYYY-MM-DD" strings everywhere in the app. Postgres DATE columns come back from Prisma as
// JavaScript Dates at UTC midnight, so toISO()/fromISO() convert at the edges and nothing drifts by a day.

export const TIME_ZONE = "Africa/Accra";
export type ISODate = string; // "2026-10-20"
export type MonthKey = string; // "2026-10"

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function today(): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

export function toISO(d: Date): ISODate;
export function toISO(d: Date | null | undefined): ISODate | null;
export function toISO(d: Date | null | undefined): ISODate | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function fromISO(s: ISODate): Date {
  return new Date(`${s}T00:00:00Z`);
}

function parts(s: ISODate): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

function make(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(s: ISODate, n: number): ISODate {
  return toISO(new Date(fromISO(s).getTime() + n * DAY));
}

/** Like dateutil's relativedelta(months=n): 31 Jan + 1 month is 28 (or 29) Feb, never 3 March. */
export function addMonths(s: ISODate, n: number): ISODate {
  const [y, m, d] = parts(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return make(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / DAY);
}

export function monthOf(s: ISODate): MonthKey {
  return s.slice(0, 7);
}

export function dayOfMonth(s: ISODate): number {
  return parts(s)[2];
}

export function addMonthsToKey(k: MonthKey, n: number): MonthKey {
  return monthOf(addMonths(`${k}-01`, n));
}

export function monthEnd(k: MonthKey): ISODate {
  const [y, m] = k.split("-").map(Number);
  return make(y, m, daysInMonth(y, m));
}

export function monthDays(k: MonthKey): number {
  const [y, m] = k.split("-").map(Number);
  return daysInMonth(y, m);
}

// ---- words -------------------------------------------------------------------
/** "October 2026" */
export function monthName(k: MonthKey, withYear = true): string {
  const [y, m] = k.split("-").map(Number);
  return withYear ? `${MONTHS_LONG[m - 1]} ${y}` : MONTHS_LONG[m - 1];
}

/** "Oct" */
export function monthShort(k: MonthKey): string {
  return MONTHS[Number(k.split("-")[1]) - 1];
}

function weekday(s: ISODate): string {
  return WEEKDAYS[fromISO(s).getUTCDay()];
}

/** "Mon 19" */
export function dayShort(s: ISODate): string {
  return `${weekday(s)} ${String(parts(s)[2]).padStart(2, "0")}`;
}

/** "Mon 19 Oct" */
export function dayMonth(s: ISODate): string {
  const [, m, d] = parts(s);
  return `${weekday(s)} ${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

/** "19 Oct 2026" */
export function longDate(s: ISODate): string {
  const [y, m, d] = parts(s);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** "19 Oct" */
export function shortDate(s: ISODate): string {
  const [, m, d] = parts(s);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

/** Today / Yesterday / Mon 19 Oct, for the activity list. */
export function dayLabel(s: ISODate, now: ISODate = today()): string {
  if (s === now) return "Today";
  if (s === addDays(now, -1)) return "Yesterday";
  if (s > now) return `Upcoming, ${dayMonth(s)}`;
  return s.slice(0, 4) === now.slice(0, 4) ? dayMonth(s) : longDate(s);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export const MONTH_ABBR = MONTHS;
