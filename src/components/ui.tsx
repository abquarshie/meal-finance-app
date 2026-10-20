// Small building blocks shared by every page (server or client).
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <h1 className="page-title">{title}</h1>
      {sub ? <div className="page-sub">{sub}</div> : null}
    </div>
  );
}

export function Section({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="section">
      <h2 className="section-title">{title}</h2>
      {aside ? <span className="section-aside">{aside}</span> : null}
    </div>
  );
}

export type Tone = "in" | "out" | "warn" | "accent" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Msg({ tone = "error", children }: { tone?: "error" | "warn" | "hint" | "ok"; children: ReactNode }) {
  return <div className={`msg ${tone}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Progress({ name, pct, tone, pill, footLeft, footRight, footOver }: {
  name: string; pct: number; tone: "ok" | "warn" | "over"; pill: ReactNode; footLeft: ReactNode; footRight?: ReactNode;
  footOver?: boolean;
}) {
  return (
    <div>
      <div className="prog-head"><span className="prog-name">{name}</span>{pill}</div>
      <div className="bar" role="progressbar" aria-label={name} aria-valuenow={Math.round(pct)} aria-valuemin={0}
        aria-valuemax={100}>
        <div className={`fill ${tone}`} style={{ width: `${Math.max(Math.min(pct, 100), 0).toFixed(1)}%` }} />
      </div>
      <div className="prog-foot"><span className={footOver ? "over" : undefined}>{footLeft}</span><span>{footRight}</span></div>
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
