import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { addDays, type ISODate } from "../dates";
import { prisma } from "../db";
import type { Kitchen } from "./kitchen";
import { MEAL_HOUR, SLOTS } from "./logic";
import { frac } from "./units";

// The meal plan as a calendar feed at /cal/<token>.ics, so a phone can subscribe without signing in. The token is
// random, kept in app_meta, and replaced when someone resets the link (the old link then stops working).

export const CAL_KEY = "calendar_token";
const PAST_DAYS = 14;
const AHEAD_DAYS = 62; // the kitchen reads 63 days ahead
const MEAL_MINUTES = 45;

export async function calendarToken(): Promise<string> {
  const row = await prisma.appMeta.findUnique({ where: { key: CAL_KEY } });
  if (row?.value) return row.value;
  const token = randomBytes(12).toString("base64url");
  // two people opening the page at once: keep whichever token was saved first
  await prisma.appMeta.upsert({ where: { key: CAL_KEY }, create: { key: CAL_KEY, value: token }, update: {} });
  return (await prisma.appMeta.findUnique({ where: { key: CAL_KEY } }))?.value ?? token;
}

export async function newCalendarToken(): Promise<void> {
  const token = randomBytes(12).toString("base64url");
  await prisma.appMeta.upsert({ where: { key: CAL_KEY }, create: { key: CAL_KEY, value: token }, update: { value: token } });
}

export async function checkCalendarToken(given: string): Promise<boolean> {
  const t = given.replace(/\.ics$/, "");
  const row = await prisma.appMeta.findUnique({ where: { key: CAL_KEY } });
  if (!row?.value || t.length !== row.value.length) return false;
  return timingSafeEqual(Buffer.from(t), Buffer.from(row.value));
}

const two = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines over 75 octets are folded, as the calendar format asks. */
function fold(line: string): string {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** One event per planned breakfast, lunch and supper, at the meal's usual hour (Accra time is UTC). */
export function mealCalendar(k: Kitchen, today: ISODate): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cashew Meals//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Meal plan", "X-WR-TIMEZONE:Africa/Accra", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H"];
  const end = addDays(today, AHEAD_DAYS);
  for (let day = addDays(today, -PAST_DAYS); day <= end; day = addDays(day, 1)) {
    const entries = k.entries(day);
    for (const slot of SLOTS) {
      const parts = entries.filter((e) => e.slot === slot);
      if (!parts.length) continue;
      const name = k.mealName(parts);
      const start = MEAL_HOUR[slot] * 60, stop = start + MEAL_MINUTES;
      const d = day.replace(/-/g, "");
      const people = k.mealPeople(day, slot);
      const detail = [
        ...k.sortParts(parts).map((e) => `• ${k.entryName(e)}${k.isBought(e) ? " (bought)" : ""}`),
        `For ${frac(people)} ${people === 1 ? "person" : "people"}.`,
      ].join("\n");
      lines.push("BEGIN:VEVENT", `UID:meal-${day}-${slot.toLowerCase()}@cashew`, `DTSTAMP:${stamp}`,
        `DTSTART:${d}T${two(Math.floor(start / 60))}${two(start % 60)}00Z`,
        `DTEND:${d}T${two(Math.floor(stop / 60))}${two(stop % 60)}00Z`,
        `SUMMARY:${esc(`${slot}: ${name}`)}`, `DESCRIPTION:${esc(detail)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
