import { NextResponse, type NextRequest } from "next/server";

/** Send signed-out visitors of app pages to /login. The API still validates the session. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("nv_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
