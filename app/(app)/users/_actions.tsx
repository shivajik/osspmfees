"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, Unlock, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createUser, setUserAccess } from "./actions";
import { ROLES } from "@/lib/auth/rbac";

export function UserAccessButtons({
  user,
}: {
  user: { id: string; name: string; email: string; active: boolean; locked: boolean; isSelf: boolean };
}) {
  const [open, setOpen] = useState<"LOCK" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async (op: "LOCK" | "UNLOCK" | "DISABLE" | "ENABLE", hours = 0, reason = "") => {
    setPending(true); setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("op", op);
    fd.set("hours", String(hours));
    fd.set("reason", reason);
    const r = await setUserAccess(fd);
    setPending(false);
    if (r?.error) return setError(r.error);
    setOpen(null);
    router.refresh();
  };

  if (user.isSelf) return <span className="text-xs text-[var(--color-fg-subtle)]">You</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {user.locked ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("UNLOCK")}>
          <Unlock className="h-3.5 w-3.5" />Unlock
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen("LOCK")}>
          <Lock className="h-3.5 w-3.5" />Lock
        </Button>
      )}
      {user.active ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("DISABLE")}>
          <UserX className="h-3.5 w-3.5" />Disable
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("ENABLE")}>
          <UserCheck className="h-3.5 w-3.5" />Enable
        </Button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}

      <Modal
        open={open === "LOCK"}
        onClose={() => setOpen(null)}
        title={`Lock ${user.name}`}
        description="A locked account cannot sign in, and any active session is revoked immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button form={`lock-${user.id}`} type="submit" disabled={pending}>Lock account</Button>
          </>
        }
      >
        <form
          id={`lock-${user.id}`}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("LOCK", Number(fd.get("hours") ?? 0), String(fd.get("reason") ?? ""));
          }}
          className="grid grid-cols-1 gap-3"
        >
          <Field label="Lock duration">
            <Select name="hours" defaultValue="0">
              <option value="0">Until manually unlocked</option>
              <option value="1">1 hour</option>
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
            </Select>
          </Field>
          <Field label="Reason" hint="Recorded in the audit log">
            <Input name="reason" maxLength={200} placeholder="Suspicious activity" />
          </Field>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}

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
