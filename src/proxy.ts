import { NextResponse, type NextRequest } from "next/server";

// Signed-out visitors go straight to the sign-in page, which brings them back here afterwards. (Whether a cookie's
// session is still valid is checked against the database on every page; this only spares a wasted render.)
export function proxy(req: NextRequest) {
  if (req.cookies.has("cashew_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next|api/health|icon|apple-icon|manifest.json|icon-.*\\.png|apple-touch-icon.png|favicon).*)"],
};
