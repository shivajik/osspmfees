import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const PUBLIC = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/health",
]);

/**
 * The one host this app answers on in production. Anything else that resolves
 * here — a stray or wildcard subdomain, the bare apex — is bounced to it so a
 * mistyped host can never serve the app under an unrecognised name.
 * Override per environment with APP_CANONICAL_HOST.
 */
const CANONICAL_HOST = (process.env.APP_CANONICAL_HOST || "app.osspmandal.com").trim().toLowerCase();

function isKnownHost(host: string): boolean {
  const name = host.split(":")[0].trim().toLowerCase();
  if (!name) return true;
  if (name === CANONICAL_HOST) return true;
  // Local development.
  if (name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost")) return true;
  // Vercel production/preview deployment URLs, used for testing before a domain is attached.
  if (name === "vercel.app" || name.endsWith(".vercel.app")) return true;
  return false;
}

// Basic per-IP token bucket in-memory (per edge instance).
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 60;
const WINDOW_MS = 60_000;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= LIMIT) return false;
  b.count++;
  return true;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Unknown host → send the visitor to the real app, keeping the path they asked
  // for. Temporary (307) on purpose: a permanent redirect would stick in browser
  // caches if the canonical host ever changes.
  const host = req.headers.get("host") ?? "";
  if (!isKnownHost(host)) {
    return NextResponse.redirect(
      new URL(`${pathname}${req.nextUrl.search}`, `https://${CANONICAL_HOST}`),
      307,
    );
  }

  // Security headers on everything.
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Rate limit API only.
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!rateLimit(ip)) return new NextResponse("Too many requests", { status: 429 });
  }

  if (PUBLIC.has(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return res;
  }

  const isApi = pathname.startsWith("/api/");
  const isApp = !isApi;

  const at = req.cookies.get("lg_at")?.value;
  const payload = at ? await verifyAccessToken(at) : null;

  if (!payload) {
    // If refresh cookie exists, allow request through — server pages will rotate via getCurrentUser().
    const hasRefresh = !!req.cookies.get("lg_rt")?.value;
    if (hasRefresh) return res;
    if (isApi) return new NextResponse("Unauthorized", { status: 401 });
    if (isApp && pathname !== "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
