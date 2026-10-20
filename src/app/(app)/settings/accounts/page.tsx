import { SettingsHead } from "@/components/SettingsTabs";
import { Empty, Section } from "@/components/ui";
import { loadBook } from "@/lib/load";
import { money } from "@/lib/money";
import { AccountForms } from "./AccountForms";

export const metadata = { title: "Accounts" };

export default async function Accounts() {
  const b = await loadBook();
  const bal = b.balances();
  const used = (n: string) => b.tx.filter((t) => t.account === n || t.toAccount === n).length
    + b.rules.filter((r) => r.account === n || r.toAccount === n).length;
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
    </>
  );
}
