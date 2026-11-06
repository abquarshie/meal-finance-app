"use client";
import { resetCalendarLink } from "@/actions/kitchen";
import { useAct } from "@/components/useAct";
import { useToast } from "@/components/Toaster";

/** The meal plan's calendar feed: copy it into a phone or Google Calendar once and new meals appear there. */
export function CalendarLink({ path }: { path: string }) {
  const toast = useToast();
  const [busy, act] = useAct();
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast("Couldn't copy. Hold the link to copy it.", { tone: "warn" }));
  const url = () => `${window.location.origin}${path}`;
  return (
    <details className="card">
      <summary>📅 Meal plan in your calendar</summary>
      <div className="stack">
        <p className="caption" style={{ marginTop: 0 }}>Subscribe once and every breakfast, lunch and supper on the plan shows in your
          phone&apos;s calendar (7:00, 13:00 and 19:00). Changes here show up there on their own within a few hours.
          Anyone with the link can see the plan, so share it only with the household.</p>
        <div className="row2">
          <button type="button" className="btn" onClick={() => copy(url(), "Calendar link")}>Copy link</button>
          {/* webcal:// makes an iPhone offer "Subscribe" instead of adding the meals once */}
          <button type="button" className="btn" onClick={() => copy(`webcal://${window.location.host}${path}`, "iPhone link")}>Copy iPhone link</button>
        </div>
        <p className="caption" style={{ margin: 0 }}>Google Calendar: on a computer, Other calendars, then + and From URL, and paste the link.
          iPhone: paste the iPhone link into Safari, or Settings, Calendar, Accounts, Add Subscribed Calendar.</p>
        <div>
          <button type="button" className="btn ghost" disabled={busy}
            onClick={() => { if (confirm("Make a new link? The old one stops working, so anyone subscribed must subscribe again.")) act(resetCalendarLink); }}>
            Make a new link</button>
        </div>
      </div>
    </details>
  );
}
