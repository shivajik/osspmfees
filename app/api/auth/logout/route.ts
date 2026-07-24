import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { pushAudit } from "@/lib/db/store";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    pushAudit({
      instituteId: user.instituteId,
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.logout",
      entity: "User",
      entityId: user.id,
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
