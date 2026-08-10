import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { loadStore } from "@/lib/db/persistence";
import { mirrorToTables, lastMirrorReport } from "@/lib/db/relational";

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
  const missing = failed.filter((r) => r.missing).map((r) => r.table);

  return NextResponse.json(
    {
      configured,
      actor: user.email,
      ok: failed.length === 0,
      totals: {
        rows: report.reduce((s, r) => s + r.rows, 0),
        written: report.reduce((s, r) => s + r.written, 0),
      },
      hint:
        missing.length > 0
          ? `These tables are not reachable through the Data API: ${missing.join(", ")}. Run scripts/sql/ledgerly-relational-tables.sql in the Supabase SQL editor.`
          : failed.length > 0
            ? "Some rows were rejected — see failed[].error for the verbatim PostgREST message."
            : "All entities are mirrored into their own tables.",
      tables: report,
      failed,
      previous: lastMirrorReport(),
    },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
