"use client";
import { useState } from "react";
import { money } from "@/lib/money";

/** Where the money went this month, by group or by category. */
export function Spending({ groups, categories }: { groups: [string, number][]; categories: [string, number][] }) {
  const [mode, setMode] = useState<"Groups" | "Categories">("Groups");
  let rows = mode === "Groups" ? groups : categories;
  if (mode === "Categories" && rows.length > 8) {
    rows = [...rows.slice(0, 7), ["Everything else", rows.slice(7).reduce((a, [, v]) => a + v, 0)]];
  }
  const total = rows.reduce((a, [, v]) => a + v, 0);
  const top = Math.max(...rows.map(([, v]) => v), 1);
  return (
    <div>
      <div className="seg" role="group" aria-label="Show" style={{ marginBottom: ".6rem", maxWidth: 280 }}>
        {(["Groups", "Categories"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      {rows.map(([name, v]) => (
        <div className="share-row" key={name}>
          <span>{name}</span><b className="num">{money(v)}</b>
          <div className="bar"><div className="fill" style={{ width: `${(v / top) * 100}%` }} /></div>
        </div>
      ))}
      {rows.length ? (
        <p className="caption">{rows[0][0]} took {((rows[0][1] / total) * 100).toFixed(0)}% of spending.</p>
      ) : null}
    </div>
  );
}
