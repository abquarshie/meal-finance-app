import { NextResponse, type NextRequest } from "next/server";
import { asSpace, SPACE_COOKIE, SPACE_HEADER, spaceOf } from "@/lib/apps";

// Signed-out visitors go straight to the sign-in page, which brings them back here afterwards. (Whether a cookie's
// session is still valid is checked against the database on every page; this only spares a wasted render.)
// Every page is also told which app it's in (Finance or Meal), remembered so shared pages keep the right name.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const decided = spaceOf(path);
  const space = decided ?? asSpace(req.cookies.get(SPACE_COOKIE)?.value);
  const remember = (res: NextResponse) => {
    if (decided && req.cookies.get(SPACE_COOKIE)?.value !== decided)
      res.cookies.set(SPACE_COOKIE, decided, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return res;
  };
  if (!req.cookies.has("cashew_session") && path !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return remember(NextResponse.redirect(url));
  }
  const headers = new Headers(req.headers);
  headers.set(SPACE_HEADER, space);
  return remember(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ["/((?!_next|api/health|icon|apple-icon|manifest|apple-touch-icon.png|favicon).*)"],
};
