"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthName } from "@/lib/dates";

/** A month picker that keeps its choice in the address (?month=2026-10), so Back and bookmarks work. */
export function MonthSelect({ months, value, allLabel, param = "month" }: {
  months: string[]; value: string; allLabel?: string; param?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select className="input" aria-label="Month" value={value} style={{ maxWidth: 240 }}
      onChange={(e) => {
        const q = new URLSearchParams(params);
        q.set(param, e.target.value);
        router.push(`${path}?${q}`);
      }}>
      {allLabel ? <option value="all">{allLabel}</option> : null}
      {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
    </select>
  );
}
