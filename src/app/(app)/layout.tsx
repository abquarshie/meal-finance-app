import { signOutAction } from "@/actions/people";
import { AddEntry } from "@/components/AddEntry";
import { Icon } from "@/components/icons";
import { SideNav, TabBar, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { entryContext } from "@/lib/entry";
import { loadBook } from "@/lib/load";

export const dynamic = "force-dynamic"; // always the family's latest figures

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const book = await loadBook(); // adds any auto transactions that are due first
  const kitchen = process.env.CASHEW_STREAMLIT_URL;
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "home", match: ["/"] },
    { href: "/transactions", label: "Money", icon: "receipt", match: ["/transactions", "/repeats"] },
    { href: "/budgets", label: "Plan", icon: "donut", match: ["/budgets", "/goals"] },
    ...(kitchen && book.feature("kitchen") ? [{ href: kitchen, label: "Kitchen", icon: "restaurant" as const, match: [], external: true }] : []),
    { href: "/settings", label: "Settings", icon: "settings", match: ["/settings"] },
  ];
  return (
    <div className="frame">
      <aside className="side">
        <a className="brand" href="/"><img src="/icon.svg" alt="" />Cashew</a>
        <SideNav items={items} />
        <div className="side-foot">
          <div className="me">
            <div className="me-avatar" aria-hidden>{user.name.slice(0, 1).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="me-name">{user.name}</div>
              <div className="me-role">{user.isOwner ? "Owner" : "Member"} · @{user.username}</div>
            </div>
          </div>
          <form action={signOutAction}>
            <button className="btn ghost" type="submit" style={{ marginTop: ".5rem" }}><Icon name="logout" /> Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
      <TabBar items={items} />
      <AddEntry ctx={entryContext(book)} />
    </div>
  );
}
