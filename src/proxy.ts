/**
 * One address for the site. Passkeys belong to one host, so www and the
 * Railway address forward to getwovi.fun with the same path and query. A 308
 * keeps the method, so API calls sent to an old address still arrive.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site";

const HOME = new URL(SITE_URL);

export function aliasRedirect(host: string | null): boolean {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === `www.${HOME.hostname}` || h.endsWith(".up.railway.app");
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!aliasRedirect(host)) return NextResponse.next();
  const to = new URL(request.nextUrl.pathname + request.nextUrl.search, HOME);
  return NextResponse.redirect(to, 308);
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
