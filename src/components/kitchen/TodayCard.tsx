import Link from "next/link";
import { STATUS_ICON, todaySummary, type Kitchen } from "@/lib/kitchen/kitchen";
import { aDb } from "@/lib/kitchen/logic";

const TONE: Record<string, string> = { warn: "warn", info: "", ok: "", hint: "" };

/** What to cook today and whether it's all in. On Home with a link to the plan; on the plan with every reminder. */
export function TodayCard({ k, onPlan = false }: { k: Kitchen; onPlan?: boolean }) {
  try {
    const s = todaySummary(k);
    const tag = (status: string, label: string) => {
      const t = status === "short" && label.startsWith("missing ") ? `Missing: ${label.slice(8)}` : label ? label[0].toUpperCase() + label.slice(1) : "";
      return t ? <div className="today-tag">{STATUS_ICON[status]} {t}</div> : null;
    };
    return (
      <div className="card today">
        <div className="today-head">🍲 Today · {aDb(s.day)}</div>
        {s.meals.length ? s.meals.map((m) => (
          <div key={m.slot} className={`today-row ${m.status}`}>
            <div className="today-dish"><span className="today-slot">{m.slot}:</span> {m.name}</div>
            {tag(m.status, m.label)}
          </div>
        )) : <div className="today-row"><div className="today-dish muted">Nothing planned for today.</div></div>}
        {onPlan ? s.notes.map(([tone, text], i) => <div key={i} className={`note ${TONE[tone] ?? ""}`} style={{ marginTop: ".5rem" }}>{text}</div>) : (
          <Link className="btn ghost" href="/meals/plan" style={{ marginTop: ".4rem" }}>
            Open the meal plan{s.reminders.length ? ` · ${s.reminders.length} reminder${s.reminders.length === 1 ? "" : "s"}` : ""}
          </Link>
        )}
      </div>
    );
  } catch (e) {
    console.error(e); // never let the kitchen break the money side
    return <p className="caption">Today&apos;s meals couldn&apos;t load.</p>;
  }
}
