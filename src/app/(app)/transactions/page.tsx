import { AddEntryButton } from "@/components/AddEntry";
import { Icon } from "@/components/icons";
import { Empty, Kpi, PageHead } from "@/components/ui";
import { cleanNote, money } from "@/lib/money";
import { findTransactions, readFilter } from "@/lib/filters";
import { loadBook } from "@/lib/load";
import { entries } from "@/lib/words";
import { TxFilters } from "./TxFilters";
import { TxList, type Row } from "./TxList";

export const metadata = { title: "Transactions" };
const SHOWN = 400; // newest first; the totals above the list always count every match

export default async function Transactions({ searchParams }: {
  searchParams: Promise<{ month?: string; type?: string; q?: string }>;
}) {
  const [b, sp] = await Promise.all([loadBook(), searchParams]);
  const f = readFilter(b, sp);
  const view = await findTransactions(b, f, SHOWN);
  const rows: Row[] = view.rows.map((t) => ({ id: t.id, date: t.date, type: t.type, category: t.category, amount: t.amount,
    account: t.account, toAccount: t.toAccount, member: t.member, note: t.note, shown: cleanNote(t.note), isAuto: t.isAuto,
    isFee: t.isFee, by: t.createdBy }));
  const qs = new URLSearchParams({ month: f.month, ...(f.kinds.length ? { type: f.kinds.join(",") } : {}), ...(f.q ? { q: f.q } : {}) });
  const hasAny = b.months().length > 1 || b.tx.length > 0;
  return (
    <>
      <PageHead title="Transactions" sub="Everything that came in, went out or moved between accounts" />
      <div className="stack">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Entries" value={String(view.count)} className="col-span-2 sm:col-span-1" />
          <Kpi label="In" value={money(view.income)} tone="in" />
          <Kpi label="Out" value={money(view.expenses)} tone="out" />
        </div>
        <div className="md:max-w-sm"><AddEntryButton /></div>
        {!hasAny ? <div className="card"><Empty>No transactions yet. Tap Add an entry to record your first one.</Empty></div> : (
          <div className="card">
            <TxFilters months={b.months()} filter={f} />
            {rows.length ? (
              <TxList rows={rows} total={view.count} categories={b.categoryNames()} accounts={b.accountNames} members={b.members()}
                kindOf={Object.fromEntries(b.kindOf)} showWho={b.multiMember}
                names={b.users.length > 1 ? Object.fromEntries(b.nameOfUser) : null} />
            ) : <Empty>Nothing matches these filters.</Empty>}
            <p className="caption">
              <a className="btn ghost" href={`/api/transactions?${qs}`} download><Icon name="download" /> Download {entries(view.count)} as a spreadsheet (CSV)</a>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
