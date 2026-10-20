import { AddEntryButton } from "@/components/AddEntry";
import { Icon } from "@/components/icons";
import { Empty, PageHead, Pill, Tabs } from "@/components/ui";
import { cleanNote, money } from "@/lib/money";
import { applyFilter, readFilter } from "@/lib/filters";
import { loadBook } from "@/lib/load";
import { entries } from "@/lib/words";
import { TxFilters } from "./TxFilters";
import { TxList, type Row } from "./TxList";

export const metadata = { title: "Transactions" };

export default async function Transactions({ searchParams }: {
  searchParams: Promise<{ month?: string; type?: string; q?: string }>;
}) {
  const [b, sp] = await Promise.all([loadBook(), searchParams]);
  const f = readFilter(b, sp);
  const view = applyFilter(b, f);
  const inc = view.filter((t) => t.type === "Income").reduce((a, t) => a + t.amount, 0);
  const out = view.filter((t) => t.type === "Expense").reduce((a, t) => a + t.amount, 0);
  const months = [...new Set(b.tx.map((t) => t.month))].sort().reverse();
  const rows: Row[] = view.map((t) => ({ id: t.id, date: t.date, type: t.type, category: t.category, amount: t.amount,
    account: t.account, toAccount: t.toAccount, member: t.member, note: t.note, shown: cleanNote(t.note), isAuto: t.isAuto,
    isFee: t.isFee, by: t.createdBy }));
  const qs = new URLSearchParams({ month: f.month, ...(f.kinds.length ? { type: f.kinds.join(",") } : {}), ...(f.q ? { q: f.q } : {}) });
  return (
    <>
      <PageHead title="Money" />
      <Tabs current="/transactions" tabs={[{ href: "/transactions", label: "Transactions" }, { href: "/repeats", label: "Repeats" }]} />
      <div className="stack">
        <div style={{ maxWidth: 420 }}><AddEntryButton /></div>
        {!b.tx.length ? <Empty>No transactions yet. Tap Add an entry to record your first one.</Empty> : (
          <div className="card">
            <TxFilters months={months} filter={f} />
            <div className="pills">
              <Pill>{entries(view.length)}</Pill><Pill tone="in">In {money(inc)}</Pill><Pill tone="out">Out {money(out)}</Pill>
            </div>
            {view.length ? (
              <TxList rows={rows} categories={b.categoryNames()} accounts={b.accountNames} members={b.members()}
                kindOf={Object.fromEntries(b.kindOf)} showWho={b.multiMember}
                names={b.users.length > 1 ? Object.fromEntries(b.nameOfUser) : null} />
            ) : <Empty>Nothing matches these filters.</Empty>}
            <p className="caption">
              <a className="btn ghost" href={`/api/transactions?${qs}`} download><Icon name="download" /> Download these as a spreadsheet (CSV)</a>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
