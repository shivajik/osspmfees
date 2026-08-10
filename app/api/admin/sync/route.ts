import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { loadStore } from "@/lib/db/persistence";
import { mirrorToTables } from "@/lib/db/relational";

/**
 * Force a full re-sync of the working store into the relational tables
 * (Institute, User, Student, FeePayment, ...) and report the result per table.
 *
 * Super Admin only. Useful to diagnose why a table looks empty: any PostgREST
 * error (missing column, FK violation, permission) is returned verbatim.
 */
export async function GET() {
  const user = await requireRole(ROLES.SUPER_ADMIN);

  await loadStore();
  const report = await mirrorToTables();

  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const failed = report.filter((r) => !r.ok);

  return NextResponse.json(
    {
      configured,
      actor: user.email,
      ok: failed.length === 0,
      tables: report,
      failed,
    },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
