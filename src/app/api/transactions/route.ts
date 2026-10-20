import { getUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import { applyFilter, readFilter } from "@/lib/filters";
import { readBook } from "@/lib/load";

/** The entries on screen as a CSV file that opens in Excel or Google Sheets. */
export async function GET(req: Request) {
  if (!(await getUser())) return new Response("Sign in first.", { status: 401 });
  const b = await readBook();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = applyFilter(b, readFilter(b, sp));
  const cols = ["id", "date", "type", "group", "category", "account", "to_account", "member", "amount", "note"] as const;
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a note can't become a spreadsheet formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(","), ...rows.map((t) => [t.id, t.date, t.type, t.group, t.category, t.account, t.toAccount,
    t.member, t.amount.toFixed(2), t.note].map(cell).join(","))];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="cashew_transactions_${today()}.csv"`,
  } });
}
