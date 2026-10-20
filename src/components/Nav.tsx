"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; match: string[] };

function active(path: string, item: NavItem) {
  return item.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(path, i) ? "page" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline transition-colors hover:bg-subtle aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-ink [&_svg]:size-5">
          <Icon name={i.icon} />{i.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 px-1 pt-1.5 pb-[calc(.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(path, i) ? "page" : undefined}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold text-muted no-underline aria-[current=page]:text-brand-ink [&_svg]:size-6">
          <Icon name={i.icon} />{i.label}
        </Link>
      ))}
    </nav>
  );
}
