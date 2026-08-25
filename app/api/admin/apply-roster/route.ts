import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES, type Role } from "@/lib/auth/rbac";
import { store, pushAudit, findUserByEmail } from "@/lib/db/store";
import { hashPassword } from "@/lib/auth/password";
import { uid } from "@/lib/utils";
import { loadStore, saveStore } from "@/lib/db/persistence";

/**
 * Step 0 of the Postgres migration: reconciles the real admin/accountant
 * roster into the JSON blob (the actual source of truth today), matching
 * what sql/update-roster.sql already applied to the Postgres mirror table.
 * Safe to re-run: updates are keyed off the still-placeholder email, and
 * new-account creation is guarded by the existing-email check.
 */

type Person = { name: string; email: string; phone: string };
type Outcome = { ok: boolean; note?: string };

function updateUser(oldEmail: string, person: Person): Outcome {
  const user = findUserByEmail(oldEmail);
  if (!user) return { ok: false, note: `not found: ${oldEmail}` };
  if (user.email.toLowerCase() !== person.email.toLowerCase() && findUserByEmail(person.email)) {
    return { ok: false, note: `target email already in use: ${person.email}` };
  }
  user.name = person.name;
  user.email = person.email;
  user.phone = person.phone;
  user.mustChangePassword = true;
  user.updatedAt = new Date().toISOString();
  return { ok: true };
}

async function createUser(person: Person, role: Role, instituteId: string | null): Promise<Outcome> {
  if (findUserByEmail(person.email)) return { ok: false, note: `already exists: ${person.email}` };
  const id = uid("usr");
  const now = new Date().toISOString();
  store.users.set(id, {
    id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    passwordHash: await hashPassword("Password123!"),
    role,
    instituteId,
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true };
}

export async function POST() {
  const actor = await requireRole(ROLES.SUPER_ADMIN);
  await loadStore({ force: true });

  const results: Record<string, Outcome> = {};

  results.superAdmin1 = updateUser("super@osspmandal.com", { name: "Gaikwad N.G.", email: "ngkishor67@gmail.com", phone: "7588023221" });
  results.superAdmin2 = await createUser({ name: "Sohale Y.B.", email: "ysohale@rediffmail.com", phone: "9800560688" }, ROLES.SUPER_ADMIN, null);

  results.vggssAdmin = updateUser("admin.vggss@osspmandal.com", { name: "Daspute G.M.", email: "ganeshdaspute91@gmail.com", phone: "8208654865" });
  results.vggssAccountant = updateUser("accountant.vggss@osspmandal.com", { name: "Jawale S.V.", email: "sanjayjawale1512@gmail.com", phone: "8459180490" });

  results.vghssAccountant = updateUser("accountant.vghss@osspmandal.com", { name: "Mhaske S.K.", email: "somnathmhaske94@gmail.com", phone: "7620988333" });

  results.ajcAdmin = updateUser("admin.ajc@osspmandal.com", { name: "Karale A.D.", email: "ashokkarale63@gmail.com", phone: "9763510140" });
  results.ajcAccountant = updateUser("accountant.ajc@osspmandal.com", { name: "Kharat S.W.", email: "sokharat143@gmail.com", phone: "9807623333" });

  results.gpesAdmin = updateUser("admin.gpes@osspmandal.com", { name: "Chavan S.A.", email: "chavansharad644@gmail.com", phone: "8208998751" });
  results.gpesAccountant = updateUser("accountant.gpes@osspmandal.com", { name: "Waghmare P.N.", email: "popatwaghmare19191@gmail.com", phone: "9021188055" });

  results.kdssAdmin = updateUser("admin.kdss@osspmandal.com", { name: "Chavan P.S.", email: "pschavan1981@gmail.com", phone: "7588023219" });
  results.kdssAccountant = updateUser("accountant.kdss@osspmandal.com", { name: "Mhaske S.B.", email: "sudammhaske927@gmail.com", phone: "9834761838" });

  results.ssrAdmin = updateUser("admin.ssr@osspmandal.com", { name: "Patil K.S.", email: "sohamkpatil82@gmail.com", phone: "9096611872" });
  results.ssrAccountant = updateUser("accountant.ssr@osspmandal.com", { name: "Gahal N.M.", email: "mvrui2008g@gmail.com", phone: "8208365247" });

  results.ssssAccountant = updateUser("accountant.ssss@osspmandal.com", { name: "Raut C.L.", email: "rautcl87@gmail.com", phone: "8378884687" });

  results.sshssAccountant = updateUser("accountant.sshss@osspmandal.com", { name: "Dhanve A.S.", email: "ssmvlj@rediffmail.com", phone: "9527687770" });

  results.obmAdmin1 = updateUser("admin.obm@osspmandal.com", { name: "Jawale S.S.", email: "jawalesurekha494@gmail.com", phone: "9405109642" });
  results.obmAccountant1 = updateUser("accountant.obm@osspmandal.com", { name: "Videkar A.R.", email: "ashwinividekar@gmail.com", phone: "9404047915" });
  results.obmAdmin2 = await createUser({ name: "Mali S.W.", email: "sambhajimali152@gmail.com", phone: "8381074440" }, ROLES.INSTITUTE_ADMIN, "inst_obm");
  results.obmAccountant2 = await createUser({ name: "Mhaske S.R.", email: "sunilmhaske33@gmail.com", phone: "9922544494" }, ROLES.ACCOUNTANT, "inst_obm");

  results.ossAdmin = updateUser("admin.oss@osspmandal.com", { name: "Game S.D.", email: "shankargame970@gmail.com", phone: "9158664125" });
  results.ossAccountant = updateUser("accountant.oss@osspmandal.com", { name: "Khandare P.R.", email: "khandarepratiksha@gmail.com", phone: "9422464624" });

  results.thsAdmin = updateUser("admin.ths@osspmandal.com", { name: "Lavange D.B.", email: "ravikiranedu101@gmail.com", phone: "8308123101" });
  results.thsAccountant = updateUser("accountant.ths@osspmandal.com", { name: "Khandagale R.A.", email: "rkpatil4272@gmail.com", phone: "8805123101" });

  pushAudit({
    instituteId: null,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "admin.apply_roster",
    entity: "User",
    meta: results,
  });

  await saveStore();
  return NextResponse.json({ ok: true, results });
}
