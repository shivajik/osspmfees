import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { findUserByEmail, pushAudit } from "@/lib/db/store";
import { loadStore, saveStore } from "@/lib/db/persistence";

/**
 * Admin utility: clears the forced-password-change flag for one account
 * without touching its password. Useful when an account never needed the
 * shared temp password rotated (e.g. it was never actually logged into
 * under its old identity) — a real fix, unlike editing the Postgres mirror
 * table directly, which the app's login never reads.
 */

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const actor = await requireRole(ROLES.SUPER_ADMIN);
  await loadStore({ force: true });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const user = findUserByEmail(parsed.data.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  user.mustChangePassword = false;
  user.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user.clear_must_change_password",
    entity: "User",
    entityId: user.id,
    meta: { email: user.email },
  });

  await saveStore();
  return NextResponse.json({ ok: true });
}
