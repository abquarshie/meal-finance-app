"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APPS, spaceOf, type Space } from "@/lib/apps";
import { Icon, type IconName } from "./icons";

type NavItem = { href: string; label: string; icon: IconName; match: string[] };

const ITEMS: Record<Space, NavItem[]> = {
  money: [
    { href: "/", label: "Home", icon: "home", match: ["/"] },
    { href: "/transactions", label: "Money", icon: "receipt", match: ["/transactions"] },
    { href: "/budgets", label: "Budgets", icon: "donut", match: ["/budgets", "/goals"] },
    { href: "/settings", label: "Settings", icon: "settings", match: ["/settings"] },
  ],
  meals: [
    { href: "/meals", label: "Home", icon: "home", match: ["/meals$"] },
    { href: "/meals/plan", label: "Plan", icon: "restaurant", match: ["/meals/plan", "/meals/recipes"] },
    { href: "/shopping", label: "Shopping", icon: "cart", match: ["/shopping"] },
    { href: "/pantry", label: "Pantry", icon: "pantry", match: ["/pantry", "/meals/fridge"] },
    { href: "/meals/household", label: "Household", icon: "clean", match: ["/meals/household"] },
    { href: "/meals/settings", label: "Settings", icon: "settings", match: ["/meals/settings"] },
  ],
};

function active(path: string, item: NavItem, items: NavItem[]) {
  // "/" and anything ending in "$" match only that exact page
  const hit = (m: string) => (m === "/" || m.endsWith("$") ? path === m.replace(/\$$/, "") : path === m || path.startsWith(`${m}/`));
  if (!item.match.some(hit)) return false;
  // when two items both match, the longer, more specific one wins
  const len = Math.max(...item.match.filter(hit).map((m) => m.length));
  return !items.some((o) => o !== item && o.match.some((m) => hit(m) && m.length > len));
}

/** Which app the page is in: decided by the page itself, or else the one you came from. */
export function useSpace(initial: Space): Space {
  const path = usePathname();
  const [last, setLast] = useState(initial);
  const decided = spaceOf(path);
  useEffect(() => { if (decided) setLast(decided); }, [decided]);
  return decided ?? last;
}

export function Brand({ initial }: { initial: Space }) {
  const app = APPS[useSpace(initial)];
  return (
    <a className="mb-4 flex items-center gap-2.5 px-2 text-lg font-bold tracking-tight text-ink no-underline" href={app.home}>
      <img src={app.icon} alt="" className="size-8" />{app.name}
    </a>
  );
}

/** A quiet link over to the other app, for when you're using both in one browser. */
export function SwitchApp({ initial }: { initial: Space }) {
  const other = APPS[useSpace(initial) === "money" ? "meals" : "money"];
  return (
    <Link href={other.home} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted no-underline hover:bg-subtle">
      <img src={other.icon} alt="" className="size-5" />Open {other.name}
    </Link>
  );
}

export function SideNav({ initial }: { initial: Space }) {
  const path = usePathname();
  const items = ITEMS[useSpace(initial)];
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(path, i, items) ? "page" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline transition-colors hover:bg-subtle aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-ink [&_svg]:size-5">
          <Icon name={i.icon} />{i.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ initial }: { initial: Space }) {
  const path = usePathname();
  const items = ITEMS[useSpace(initial)];
  return (
    <nav aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 px-1 pt-1.5 pb-[calc(.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(path, i, items) ? "page" : undefined}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold text-muted no-underline aria-[current=page]:text-brand-ink [&_svg]:size-6">
          <Icon name={i.icon} />{i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phones only (no sidebar there): the app you're in on the left and a one-tap switch to the other on the right. */
export function MobileBar({ initial }: { initial: Space }) {
  const space = useSpace(initial);
  const app = APPS[space];
  const other = APPS[space === "money" ? "meals" : "money"];
  return (
    <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
      <Link href={app.home} className="flex items-center gap-2 text-base font-bold tracking-tight text-ink no-underline">
        <img src={app.icon} alt="" className="size-7" />{app.name}
      </Link>
      <Link href={other.home} aria-label={`Switch to ${other.name}`}
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] font-semibold text-ink no-underline shadow-soft">
        <img src={other.icon} alt="" className="size-6" />{other.name}
      </Link>
    </div>
  );
}
