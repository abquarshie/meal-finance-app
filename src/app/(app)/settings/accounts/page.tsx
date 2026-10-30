import { OtherApp } from "@/components/OtherApp";
import { SettingsHead } from "@/components/SettingsTabs";
import { Empty, Section } from "@/components/ui";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { AccountForms } from "./AccountForms";

export const metadata = { title: "Accounts" };

export default async function Accounts() {
  // how many entries and auto rules use each account, counted by the database
  const [b, from, to, ruleFrom, ruleTo] = await Promise.all([loadBook(),
    prisma.transaction.groupBy({ by: ["account"], _count: true }),
    prisma.transaction.groupBy({ by: ["toAccount"], _count: true }),
    prisma.recurringRule.groupBy({ by: ["account"], _count: true }),
    prisma.recurringRule.groupBy({ by: ["toAccount"], _count: true })]);
  const bal = b.balances();
  const counts = new Map<string, number>();
  for (const [name, c] of [...from.map((r) => [r.account, r._count] as const), ...to.map((r) => [r.toAccount, r._count] as const),
    ...ruleFrom.map((r) => [r.account, r._count] as const), ...ruleTo.map((r) => [r.toAccount, r._count] as const)]) {
    if (name) counts.set(name, (counts.get(name) ?? 0) + c);
  }
  const used = (n: string) => counts.get(n) ?? 0;
  return (
    <>
      <SettingsHead current="/settings/accounts" sub="Shape the app around how your family handles money" />
      <div className="grid32">
        <div className="card">
          <Section title="Your accounts" />
          {b.accounts.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Account</th><th className="r">Opening</th><th className="r">Balance now</th><th>Everyday money</th></tr></thead>
              <tbody>{b.accounts.map((a) => (
                <tr key={a.id}><td>{a.name}</td><td className="r num">{money(a.openingBalance)}</td>
                  <td className="r num">{money(bal.get(a.name) ?? 0)}</td><td>{a.spendable ? "Yes" : "No, savings"}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>No accounts yet. Add your first one on this page.</Empty>}
          <p className="caption">Everyday money counts towards what&apos;s left to spend. Savings like Susu or an emergency
            fund never do.</p>
        </div>
        <AccountForms unassigned={b.unassigned}
          accounts={b.accounts.map((a) => ({ name: a.name, opening: a.openingBalance, spendable: a.spendable,
            balance: bal.get(a.name) ?? 0, used: used(a.name) }))} />
      </div>
      <OtherApp from="money" />
    </>
  );
}
