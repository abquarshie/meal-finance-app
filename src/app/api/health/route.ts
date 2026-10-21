import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** For an uptime monitor: 200 when the app can reach the database, 503 when it can't. Needs no sign-in and shows
 * no data. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Health check: database unreachable", e);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
