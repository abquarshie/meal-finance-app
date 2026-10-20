import { SettingsHead } from "@/components/SettingsTabs";
import { Section } from "@/components/ui";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { CategoryForms } from "./CategoryForms";

export const metadata = { title: "Categories" };

export default async function Categories() {
  const [b, counts] = await Promise.all([loadBook(), prisma.transaction.groupBy({ by: ["category"], _count: true })]);
  const used: Record<string, number> = Object.fromEntries(counts.map((c) => [c.category, c._count]));
  return (
    <>
      <SettingsHead current="/settings/categories" sub="Shape the app around how your family handles money" />
      <div className="grid32">
        <div className="card">
          <Section title="Your categories" aside={`${b.categories.length} in ${b.groups.length} groups`} />
          <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}><table className="table">
            <thead><tr><th>Group</th><th>Category</th><th>Type</th><th className="r">Entries</th></tr></thead>
            <tbody>{b.groups.flatMap((g) => b.categories.filter((c) => c.groupName === g)).map((c) => (
              <tr key={c.id}><td>{c.groupName}</td><td>{c.name}</td><td>{c.kind}</td><td className="r num">{used[c.name] ?? 0}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <CategoryForms groups={b.groups} used={used}
          categories={b.groups.flatMap((g) => b.categories.filter((c) => c.groupName === g)).map((c) => ({ name: c.name, group: c.groupName, kind: c.kind }))} />
      </div>
    </>
  );
}
