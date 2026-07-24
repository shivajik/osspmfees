"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createUser } from "./actions";
import { ROLES } from "@/lib/auth/rbac";

export function NewUserButton({
  isSuper,
  institutes,
  defaultInstituteId,
}: {
  isSuper: boolean;
  institutes: { id: string; name: string }[];
  defaultInstituteId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const roles = isSuper
    ? Object.values(ROLES)
    : [ROLES.INSTITUTE_ADMIN, ROLES.ACCOUNTANT, ROLES.CASHIER, ROLES.VIEWER];

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Invite user</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create user"
        description="Passwords are set to the temporary value shown. User can change it after login."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-user-form" type="submit" disabled={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-user-form"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createUser(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Full name"><Input name="name" required maxLength={120} /></Field>
          <Field label="Email"><Input name="email" type="email" required maxLength={200} /></Field>
          <Field label="Role">
            <Select name="role" defaultValue={roles[0]}>
              {roles.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Institute">
            <Select name="instituteId" defaultValue={defaultInstituteId ?? ""} disabled={!isSuper}>
              {isSuper && <option value="">Platform (Super Admin)</option>}
              {institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Temporary password" hint="Minimum 10 characters, mixed case & number">
              <Input name="password" type="text" minLength={10} required defaultValue="Password123!" />
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
