import { NextResponse } from "next/server";
import { z } from "zod";
import { pushAudit, store } from "@/lib/db/store";
import { hashPassword } from "@/lib/auth/password";
import { loadStore, saveStore } from "@/lib/db/persistence";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Uppercase required")
    .regex(/[a-z]/, "Lowercase required")
    .regex(/\d/, "Digit required"),
});

export async function POST(req: Request) {
  await loadStore();
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  const { token, password } = parsed.data;
  const record = store.passwordResets.get(token);
  if (!record || record.usedAt || record.expiresAt < Date.now()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }
  const user = store.users.get(record.userId);
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  user.passwordHash = await hashPassword(password);
  user.updatedAt = new Date().toISOString();
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  record.usedAt = Date.now();

  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.password_reset",
    entity: "User",
    entityId: user.id,
  });
  await saveStore();

  return NextResponse.json({ ok: true });
}
