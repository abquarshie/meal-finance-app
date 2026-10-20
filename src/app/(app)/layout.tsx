import { signOutAction } from "@/actions/people";
import { AddEntry } from "@/components/AddEntry";
import { Icon } from "@/components/icons";
import { SideNav, TabBar, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { entryContext } from "@/lib/entry";
import { loadBook } from "@/lib/load";

export const dynamic = "force-dynamic"; // always the family's latest figures

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, book] = await Promise.all([requireUser(), loadBook()]); // loadBook adds any auto transactions due first
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "home", match: ["/"] },
    { href: "/transactions", label: "Money", icon: "receipt", match: ["/transactions"] },
    { href: "/budgets", label: "Budgets", icon: "donut", match: ["/budgets"] },
    ...(book.feature("kitchen") ? [{ href: "/meals", label: "Kitchen", icon: "restaurant" as const, match: ["/meals", "/shopping", "/pantry"] }] : []),
    { href: "/settings", label: "Settings", icon: "settings", match: ["/settings"] },
  ];
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-surface px-3 py-5 md:flex">
        <a className="mb-4 flex items-center gap-2.5 px-2 text-lg font-bold tracking-tight text-ink no-underline" href="/">
          <img src="/icon.svg" alt="" className="size-8" />Cashew
        </a>
        <SideNav items={items} />
        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <div className="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink" aria-hidden>
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.isOwner ? "Owner" : "Member"} · @{user.username}</div>
            </div>
          </div>
          <form action={signOutAction}>
            <button className="btn ghost mt-2" type="submit"><Icon name="logout" /> Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 md:px-8 md:pt-9 md:pb-16">{children}</main>
      <TabBar items={items} />
      <AddEntry ctx={entryContext(book)} />
    </div>
  );
}
