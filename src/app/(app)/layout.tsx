import { signOutAction } from "@/actions/people";
import { AddEntry } from "@/components/AddEntry";
import { Icon } from "@/components/icons";
import { Brand, SideNav, SwitchApp, TabBar } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { entryContext } from "@/lib/entry";
import { loadBook } from "@/lib/load";
import { currentSpace } from "@/lib/space";

export const dynamic = "force-dynamic"; // always the family's latest figures

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, book, space] = await Promise.all([requireUser(), loadBook(), currentSpace()]); // loadBook adds any auto transactions due first
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-surface px-3 py-5 md:flex">
        <Brand initial={space} />
        <SideNav initial={space} />
        {book.feature("kitchen") ? <div className="mt-3 border-t border-line pt-3"><SwitchApp initial={space} /></div> : null}
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
      <TabBar initial={space} />
      <AddEntry ctx={entryContext(book)} />
    </div>
  );
}
