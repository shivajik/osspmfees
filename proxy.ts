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
