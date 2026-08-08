import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt";
import { isProd } from "@/lib/env";
import { permissionsForRole, type Role } from "./rbac";
import { store, type User } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { loadStore, saveStore } from "@/lib/db/persistence";

const ACCESS_COOKIE = "lg_at";
const REFRESH_COOKIE = "lg_rt";
const CSRF_COOKIE = "lg_csrf";

const baseCookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  path: "/",
};

function isUsable(user: User | undefined | null): user is User {
  if (!user || !user.active) return false;
  if (user.lockedUntil && user.lockedUntil > Date.now()) return false;
  return true;
}

export async function createSession(user: User) {
  const jti = uid("rt");
  const access = await signAccessToken({
    sub: user.id,
    role: user.role,
    instituteId: user.instituteId,
    permissions: permissionsForRole(user.role),
  });
  const refresh = await signRefreshToken({ sub: user.id, jti });

  store.refreshTokens.set(jti, { userId: user.id, createdAt: Date.now() });

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, access, { ...baseCookieOpts, maxAge: ACCESS_TTL_SECONDS });
  jar.set(REFRESH_COOKIE, refresh, { ...baseCookieOpts, maxAge: REFRESH_TTL_SECONDS });
  jar.set(CSRF_COOKIE, uid("csrf"), { ...baseCookieOpts, httpOnly: false, maxAge: REFRESH_TTL_SECONDS });
  await saveStore();
}

export async function destroySession() {
  const jar = await cookies();
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (rt) {
    const payload = await verifyRefreshToken(rt);
    if (payload?.jti) store.refreshTokens.delete(payload.jti);
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  jar.delete(CSRF_COOKIE);
  await saveStore();
}

export async function rotateSession(): Promise<User | null> {
  const jar = await cookies();
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  const payload = await verifyRefreshToken(rt);
  if (!payload?.jti || !store.refreshTokens.has(payload.jti)) return null;
  // Refresh rotation: invalidate old, mint new
  store.refreshTokens.delete(payload.jti);
  const user = store.users.get(payload.sub);
  if (!isUsable(user)) return null;
  await createSession(user);
  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  await loadStore();
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) {
      const u = store.users.get(payload.sub);
      if (isUsable(u)) return u;
    }
  }
  return rotateSession();
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: Role | Role[]): Promise<User> {
  const user = await requireUser();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role as Role)) redirect("/dashboard");
  return user;
}
