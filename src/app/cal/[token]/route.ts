import { today } from "@/lib/dates";
import { checkCalendarToken, mealCalendar } from "@/lib/kitchen/calendar";
import { readKitchen } from "@/lib/kitchen/load";

export const dynamic = "force-dynamic";

// The meal plan as a calendar feed (no sign-in: the link is the key). Phones that subscribe re-read it every few
// hours, so meals added or changed on the plan show up on their own.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!(await checkCalendarToken((await params).token)))
      return new Response("This calendar link doesn't work any more. Copy the new one from the meal plan page.", { status: 404 });
    const now = today();
    const body = mealCalendar(await readKitchen(now), now);
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="meal-plan.ics"',
        "cache-control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response("Couldn't read the meal plan just now.", { status: 503 });
  }
}
