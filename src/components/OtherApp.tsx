import Link from "next/link";
import { APPS, type Space } from "@/lib/apps";

/** On each app's settings page: the way over to the other app (phones have no sidebar), and how to put it on the
 * home screen as an app of its own. */
export function OtherApp({ from }: { from: Space }) {
  const other = APPS[from === "money" ? "meals" : "money"];
  return (
    <div className="card mt-6 flex max-w-[560px] items-center gap-3">
      <img src={other.icon} alt="" className="size-10 flex-none" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{other.name}</div>
        <div className="text-sm text-muted">{other.tagline}. To keep it as its own app, open it and choose Add to Home Screen.</div>
      </div>
      <Link className="btn" href={other.home}>Open</Link>
    </div>
  );
}
