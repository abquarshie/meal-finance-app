"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { monthName } from "@/lib/dates";
import type { TxFilter } from "@/lib/filters";
import { KINDS, type Kind } from "@/lib/money";

export function TxFilters({ months, filter }: { months: string[]; filter: TxFilter }) {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState(filter.q);
  const go = (f: Partial<TxFilter>) => {
    const n = { ...filter, ...f };
    const p = new URLSearchParams({ month: n.month });
    if (n.kinds.length) p.set("type", n.kinds.join(","));
    if (n.q) p.set("q", n.q);
    router.replace(`${path}?${p}`, { scroll: false });
  };
  useEffect(() => {
    if (q === filter.q) return;
    const t = setTimeout(() => go({ q }), 300);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: Kind) => go({ kinds: filter.kinds.includes(k) ? filter.kinds.filter((x) => x !== k) : [...filter.kinds, k] });
  return (
    <div className="form" style={{ marginBottom: ".7rem" }}>
      <div className="row2">
        <select className="input" aria-label="Month" value={filter.month} onChange={(e) => go({ month: e.target.value })}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <div className="chips" role="group" aria-label="Type">
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={filter.kinds.includes(k)} onClick={() => toggle(k)}>{k}</button>
          ))}
        </div>
      </div>
      <input className="input" type="search" aria-label="Search" placeholder="Search notes, categories or people" value={q}
        onChange={(e) => setQ(e.target.value)} />
    </div>
  );
}
