"use client";
import { useState } from "react";
import { monthShort } from "@/lib/dates";
import { money } from "@/lib/money";

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#c98500"];

/** Average price paid each month for up to 4 items. */
export function PriceChart({ series }: { series: { name: string; points: [string, number][] }[] }) {
  const [picked, setPicked] = useState(series.slice(0, 3).map((s) => s.name));
  const shown = series.filter((s) => picked.includes(s.name));
  const months = [...new Set(shown.flatMap((s) => s.points.map(([m]) => m)))].sort();
  const max = Math.max(...shown.flatMap((s) => s.points.map(([, v]) => v)), 1);
  const W = 640;
  const H = 220;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const x = (m: string) => pad.l + (months.length > 1 ? (months.indexOf(m) / (months.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (1 - v / (max * 1.1)) * (H - pad.t - pad.b);
  return (
    <div>
      <div className="chips" role="group" aria-label="Items" style={{ marginBottom: ".6rem" }}>
        {series.map((s) => (
          <button key={s.name} type="button" className="chip" aria-pressed={picked.includes(s.name)}
            onClick={() => setPicked(picked.includes(s.name) ? picked.filter((n) => n !== s.name) : [...picked, s.name].slice(-4))}>
            {picked.includes(s.name) ? <span style={{ color: COLORS[picked.indexOf(s.name)] }}>● </span> : null}{s.name}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Average price paid each month">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * 1.1 * f)} y2={y(max * 1.1 * f)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(max * 1.1 * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(max * 1.1 * f)}</text>
          </g>
        ))}
        {months.map((m, i) => <text key={m} x={x(m)} y={H - 8} textAnchor={months.length > 1 && i === months.length - 1 ? "end" : months.length > 1 && i === 0 ? "start" : "middle"} fontSize="11" fill="var(--muted)">{monthShort(m)} {m.slice(2, 4)}</text>)}
        {shown.map((s) => {
          const c = COLORS[picked.indexOf(s.name)];
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={c} strokeWidth="2" points={s.points.map(([m, v]) => `${x(m)},${y(v)}`).join(" ")} />
              {s.points.map(([m, v]) => <circle key={m} cx={x(m)} cy={y(v)} r="4" fill={c}><title>{`${s.name}, ${monthShort(m)}: ${money(v)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <p className="caption">Average price paid each month. The table has the last price, the change since the trip before, and where it&apos;s cheapest.</p>
    </div>
  );
}
