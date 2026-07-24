import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";

const schema = z.object({ email: z.string().email().max(200) });

export async function POST(req: Request) {
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

  // In production, email this link. In preview we return it for demo purposes.
  const link = `/reset-password?token=${token}`;
  return NextResponse.json({ ok: true, previewLink: link });
}
