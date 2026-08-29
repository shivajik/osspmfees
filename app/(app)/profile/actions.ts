"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { pushAudit, store } from "@/lib/db/store";
import { saveStore } from "@/lib/db/persistence";

const schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(20).optional().or(z.literal("")),
});

/** Lets a user fix their own display name/phone — never touches email, since that's the login identifier. */
export async function updateProfile(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };

  const target = store.users.get(user.id);
  if (!target) return { error: "User not found" };

  target.name = parsed.data.name;
  target.phone = parsed.data.phone || undefined;
  target.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id,
    actorEmail: user.email,
    action: "user.update_profile",
    entity: "User",
    entityId: user.id,
    meta: { name: target.name, phone: target.phone ?? null },
  });
  await saveStore();
}
