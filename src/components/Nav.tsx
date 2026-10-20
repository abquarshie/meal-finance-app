"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; match: string[]; external?: boolean };

function active(path: string, item: NavItem) {
  return item.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {items.map((i) => i.external ? (
        <a key={i.href} className="nav-link" href={i.href} target="_blank" rel="noreferrer"><Icon name={i.icon} />{i.label}</a>
      ) : (
        <Link key={i.href} className="nav-link" href={i.href} aria-current={active(path, i) ? "page" : undefined}>
          <Icon name={i.icon} />{i.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map((i) => i.external ? (
        <a key={i.href} href={i.href} target="_blank" rel="noreferrer"><Icon name={i.icon} />{i.label}</a>
      ) : (
        <Link key={i.href} href={i.href} aria-current={active(path, i) ? "page" : undefined}><Icon name={i.icon} />{i.label}</Link>
      ))}
    </nav>
  );
}
