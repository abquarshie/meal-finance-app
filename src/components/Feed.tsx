import type { Book, Tx } from "@/lib/book";
import { dayLabel, type ISODate } from "@/lib/dates";
import { cleanNote, money, SHARED } from "@/lib/money";
import { Pill } from "./ui";

export type FeedItem = {
  key: string; date: ISODate; kind: "Income" | "Expense" | "Transfer"; title: string; amount: number;
  account: string; to: string; who: string; note: string; auto: boolean; fee: boolean; by: string;
};

export function txItem(t: Tx): FeedItem {
  return { key: `t${t.id}`, date: t.date, kind: t.type, title: t.category, amount: t.amount, account: t.account,
    to: t.toAccount, who: t.member, note: cleanNote(t.note), auto: t.isAuto, fee: t.isFee, by: t.createdBy };
}

/** The latest transactions, newest first. */
export function activity(b: Book, limit = 8): FeedItem[] {
  return b.tx.slice(0, limit).map(txItem);
}

export function FeedRow({ i, showWho, names }: { i: FeedItem; showWho?: boolean; names?: Map<string, string> }) {
  const [icon, cls, amount, where] =
    i.kind === "Income" ? ["+", "in", money(i.amount, true), i.account]
      : i.kind === "Expense" ? ["−", "out", money(-i.amount, true), i.account]
        : ["⇄", "move", money(i.amount), `${i.account || "?"} to ${i.to || "?"}`];
  const meta: React.ReactNode[] = [];
  if (where) meta.push(<b key="w">{where}</b>);
  if (showWho && i.who !== SHARED) meta.push(i.who);
  if (i.note && !i.auto) meta.push(i.note);
  if (names && i.by) meta.push(`added by ${names.get(i.by) ?? i.by}`);
  return (
    <>
      <div className={`feed-icon ${cls}`} aria-hidden>{icon}</div>
      <div className="feed-main">
        <div className="feed-title"><span className="t">{i.title}</span>{i.auto ? <Pill tone="accent">Auto</Pill> : null}
          {i.fee ? <Pill>Fee</Pill> : null}</div>
        <div className="feed-meta">{meta.map((m, k) => <span key={k}>{k ? ", " : ""}{m}</span>)}</div>
      </div>
      <div className={`amt ${cls}`}>{amount}</div>
    </>
  );
}

export function Feed({ items, showWho, names }: { items: FeedItem[]; showWho?: boolean; names?: Map<string, string> }) {
  let last: string | null = null;
  return (
    <div className="feed">
      {items.map((i) => {
        const head = i.date !== last ? <div className="feed-day">{dayLabel(i.date)}</div> : null;
        last = i.date;
        return (
          <div key={i.key}>
            {head}
            <div className="feed-row"><FeedRow i={i} showWho={showWho} names={names} /></div>
          </div>
        );
      })}
    </div>
  );
}
