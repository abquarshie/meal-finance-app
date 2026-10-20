import type { BudgetStatus } from "@/lib/book";
import { money } from "@/lib/money";
import { budgetState } from "@/lib/words";
import { Pill, Progress } from "./ui";

export function BudgetList({ status }: { status: BudgetStatus[] }) {
  return (
    <div className="prog-list">
      {status.map((s) => {
        const st = budgetState(s);
        return (
          <Progress key={s.name} name={s.name} pct={s.pct} tone={st.tone}
            pill={<Pill tone={st.tone === "over" ? "out" : st.tone === "warn" ? "warn" : "in"}>{st.label}</Pill>}
            footLeft={st.foot} footOver={st.tone === "over"}
            footRight={<span className="num">{money(s.spent)} of {money(s.limit)}</span>} />
        );
      })}
    </div>
  );
}
