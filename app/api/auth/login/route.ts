import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { findUserByEmail, pushAudit } from "@/lib/db/store";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const LOCK_THRESHOLD = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { email, password } = parsed.data;
  const user = findUserByEmail(email);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();

  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  if (!user.active) return NextResponse.json({ error: "Account disabled" }, { status: 403 });

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return NextResponse.json({ error: "Account locked. Try again later." }, { status: 423 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= LOCK_THRESHOLD) {
      user.lockedUntil = Date.now() + LOCK_MS;
      user.failedLoginCount = 0;
    }
    pushAudit({
      instituteId: user.instituteId,
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.login_failed",
      entity: "User",
      entityId: user.id,
      ip: ip ?? undefined,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await createSession(user);
  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    ip: ip ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
