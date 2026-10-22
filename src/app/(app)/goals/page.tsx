import { Empty, PageHead, Pill, Progress, Section, Tabs } from "@/components/ui";
import { dayLabel, longDate, today } from "@/lib/dates";
import { loadGoals, recentMoves, type Goal } from "@/lib/goals";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { GoalForms, NewGoal } from "./GoalForms";

export const metadata = { title: "Goals" };

function progress(g: Goal, now: string) {
  const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
  const left = Math.max(g.targetAmount - g.currentAmount, 0);
  const right = <span className="num">{money(g.currentAmount)} of {money(g.targetAmount)}</span>;
  if (left === 0) return <Progress name={g.name} pct={100} tone="ok" pill={<Pill tone="in">Reached</Pill>} footLeft="Goal reached" footRight={right} />;
  if (g.targetDate && g.targetDate < now) {
    return <Progress name={g.name} pct={pct} tone="over" pill={<Pill tone="out">Past date</Pill>} footLeft={`${money(left)} to go`} footRight={right} footOver />;
  }
  if (g.targetDate) {
    const [y1, m1] = now.split("-").map(Number);
    const [y2, m2] = g.targetDate.split("-").map(Number);
    const months = Math.max((y2 - y1) * 12 + (m2 - m1), 1);
    return <Progress name={g.name} pct={pct} tone="ok" pill={<Pill tone="accent">By {longDate(g.targetDate)}</Pill>}
      footLeft={`About ${money(left / months)} a month`} footRight={right} />;
  }
  return <Progress name={g.name} pct={pct} tone="ok" pill={<Pill>{Math.floor(pct)}%</Pill>} footLeft={`${money(left)} to go`} footRight={right} />;
}

export default async function Goals() {
  const [book, goals, moves] = await Promise.all([loadBook(), loadGoals(), recentMoves(8)]);
  const now = today();
  const balances = Object.fromEntries(book.balances());
  return (
    <>
      <PageHead title="Goals" sub="Each goal is its own savings pot. Move money in from any account, or back out." />
      <Tabs current="/goals" tabs={[{ href: "/budgets", label: "Budgets" }, { href: "/goals", label: "Goals" }]} />
      <div className="grid32">
        <div className="stack">
          {goals.length ? goals.map((g) => (
            <div className="card" key={g.id}>
              {progress(g, now)}
              <GoalForms goal={{ id: g.id, name: g.name, current: g.currentAmount, left: Math.max(g.targetAmount - g.currentAmount, 0) }}
                accounts={book.accountNames} balances={balances} />
            </div>
          )) : <div className="card"><Empty>No goals yet. Create your first one on this page.</Empty></div>}
        </div>
        <div className="stack">
          <NewGoal today={now} names={goals.map((g) => g.name)} />
          {moves.length ? (
            <div className="card">
              <Section title="Recent moves" />
              {moves.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.goal}</div>
                    <div className="truncate text-xs text-muted">{dayLabel(m.date, now)}{m.note ? ` · ${m.note}` : ""}</div>
                  </div>
                  <b className={`num whitespace-nowrap ${m.amount < 0 ? "text-out" : "text-in"}`}>{money(m.amount, true)}</b>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
