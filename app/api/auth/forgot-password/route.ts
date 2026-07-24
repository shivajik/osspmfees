import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { isEmailConfigured, sendPasswordResetEmail } from "@/lib/email/mailer";
import { loadStore, saveStore } from "@/lib/db/persistence";

const schema = z.object({ email: z.string().email().max(200) });

export async function POST(req: Request) {
  await loadStore();
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  // Always respond OK to avoid email enumeration.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const user = findUserByEmail(parsed.data.email);
  if (!user) return NextResponse.json({ ok: true });

  const token = uid("prt") + uid("prt");
  store.passwordResets.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 1000 * 60 * 30,
    usedAt: null,
  });

  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.password_reset_requested",
    entity: "User",
    entityId: user.id,
  });
  await saveStore();

  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const path = `/reset-password?token=${encodeURIComponent(token)}`;

  if (isEmailConfigured()) {
    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: `${origin}${path}`,
      });
    } catch (error) {
      store.passwordResets.delete(token);
      await saveStore();
      console.error("Password reset email failed", error);
    }
  }

  // Keep local development usable before SMTP credentials are configured.
  const previewLink = process.env.NODE_ENV !== "production" && !isEmailConfigured() ? path : undefined;
  return NextResponse.json({ ok: true, previewLink });
}
