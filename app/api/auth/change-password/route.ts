import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { pushAudit, store } from "@/lib/db/store";
import { saveStore } from "@/lib/db/persistence";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Uppercase required")
    .regex(/[a-z]/, "Lowercase required")
    .regex(/\d/, "Digit required"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  const stored = store.users.get(user.id);
  if (!stored) return NextResponse.json({ error: "User missing" }, { status: 400 });
  stored.passwordHash = await hashPassword(parsed.data.newPassword);
  stored.mustChangePassword = false;
  stored.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.password_changed",
    entity: "User",
    entityId: user.id,
  });
  await saveStore();

  return NextResponse.json({ ok: true });
}
