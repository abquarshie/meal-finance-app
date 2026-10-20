import { Empty, PageHead, Pill, Section, Tabs } from "@/components/ui";
import { ruleStatus, type Book, type RuleRow } from "@/lib/book";
import { dayMonth, longDate, today } from "@/lib/dates";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { ManageRule, NewRule } from "./RuleForms";

export const metadata = { title: "Repeats" };

function RuleLine({ b, r, now }: { b: Book; r: RuleRow; now: string }) {
  const [status, tone] = ruleStatus(r);
  const what = r.type === "Transfer" ? `${r.account} to ${r.toAccount}` + (r.fee ? `, ${money(r.fee)} fee` : "")
    : `${b.catLabel(r.category)}, ${r.type === "Expense" ? "from" : "into"} ${r.account}`;
  const next = r.active ? (r.nextDate <= now ? "Next: today" : `Next: ${dayMonth(r.nextDate)}`)
    : status === "Finished" && r.endDate ? `Ended ${longDate(r.endDate)}` : "Not running";
  const ends = r.endDate && r.active ? `, until ${longDate(r.endDate)}` : "";
  return (
    <div className="rule">
      <div style={{ minWidth: 0 }}>
        <div className="rule-name">{r.name}<Pill tone={tone}>{status}</Pill></div>
        <div className="rule-meta">{r.frequency} {r.type.toLowerCase()}{ends}. {what}</div>
      </div>
      <div className="rule-right"><div className="amt">{money(r.amount)}</div><div className="rule-next">{next}</div></div>
    </div>
  );
}

export default async function Repeats() {
  const b = await loadBook();
  const now = today();
  const rules = [...b.rules].sort((x, y) => Number(!x.active) - Number(!y.active) || (x.nextDate < y.nextDate ? -1 : x.nextDate > y.nextDate ? 1 : 0));
  return (
    <>
      <PageHead title="Money" />
      <Tabs current="/repeats" tabs={[{ href: "/transactions", label: "Transactions" }, { href: "/repeats", label: "Repeats" }]} />
      <p className="page-sub" style={{ margin: "-.4rem 0 1rem" }}>Salary, rent, Susu and other entries that add themselves on a schedule</p>
      <div className="grid32">
        <div className="stack">
          <div className="card">
            <Section title="Your auto transactions" />
            {rules.length ? (
              <>
                {rules.map((r) => <RuleLine key={r.id} b={b} r={r} now={now} />)}
                <p className="caption">They&apos;re added each day, and whenever the app opens. If a day is missed, the entry is
                  added with its original date.</p>
              </>
            ) : <Empty>None yet. Create one on this page, for example a monthly move from GCB to Susu.</Empty>}
          </div>
          {rules.length ? (
            <div className="card">
              <Section title="Change, pause or delete" />
              <ManageRule rules={rules.map((r) => ({ id: r.id, name: r.name, type: r.type, amount: r.amount, fee: r.fee,
                endDate: r.endDate, startDate: r.startDate, status: ruleStatus(r)[0] }))} />
            </div>
          ) : null}
        </div>
        <div className="card">
          <Section title="New auto transaction" />
          {b.accountNames.length ? (
            <NewRule today={now} accounts={b.accountNames} members={b.members()} taken={b.rules.map((r) => r.name.toLowerCase())}
              categories={{ Expense: b.categoryNames("Expense"), Income: b.categoryNames("Income"), Transfer: b.categoryNames("Transfer") }}
              labels={Object.fromEntries(b.categoryNames().map((c) => [c, b.catLabel(c)]))} />
          ) : <div className="note warn">Add an account first in Settings → Accounts.</div>}
        </div>
      </div>
    </>
  );
}
