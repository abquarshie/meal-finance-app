// Auto transactions: the same rules as the Python side (auto_rules.py), so both can run against one database.
import { addDays, addMonths, type ISODate } from "./dates";
import type { Frequency } from "./money";

/** The date of the n-th run (0-based) of a rule that starts on `start`. */
export function occurrence(start: ISODate, frequency: Frequency | string, n: number): ISODate {
  if (frequency === "Weekly") return addDays(start, 7 * n);
  if (frequency === "Every 2 weeks") return addDays(start, 14 * n);
  if (frequency === "Yearly") return addMonths(start, 12 * n);
  return addMonths(start, n);
}

/** The run number of the first date from today on, skipping the dates a rule wasn't running (paused, or finished
 * and then extended), so they aren't all added at once. */
export function catchUp(start: ISODate, frequency: Frequency | string, n: number, today: ISODate): number {
  let guard = 0;
  while (occurrence(start, frequency, n) < today && guard < 5000) {
    n += 1;
    guard += 1;
  }
  return n;
}

/** How many entries a new rule starting in the past will add straight away. */
export function missedRuns(start: ISODate, frequency: Frequency | string, end: ISODate | null, today: ISODate): number {
  let n = 0;
  while (n < 400) {
    const d = occurrence(start, frequency, n);
    if (d > today || (end && d > end)) break;
    n += 1;
  }
  return n;
}
