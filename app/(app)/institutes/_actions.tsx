"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createInstitute, deleteInstitute, updateInstitute } from "./actions";
import { withMinDelay } from "@/lib/utils";

export type InstituteRow = {
  id: string; name: string; code: string;
  email?: string; phone?: string; address?: string;
  status: "ACTIVE" | "SUSPENDED";
};

export function EditInstituteButton({ institute }: { institute: InstituteRow }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const formId = `edit-institute-${institute.id}`;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${institute.name}`}
        description="Update the institute's name, contact details, code, or status."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={formId} type="submit" disabled={pending} loading={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true); setError(null);
            const result = await withMinDelay(updateInstitute(fd));
            setPending(false);
            if (result?.error) return setError(result.error);
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={institute.id} />
          <Field label="Name"><Input name="name" required maxLength={120} defaultValue={institute.name} /></Field>
          <Field label="Code" hint="Fixed after creation — can't be changed">
            <Input value={institute.code} disabled readOnly className="cursor-not-allowed opacity-60" />
          </Field>
          <Field label="Email"><Input name="email" type="email" maxLength={200} defaultValue={institute.email ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" maxLength={40} defaultValue={institute.phone ?? ""} /></Field>
          <div className="sm:col-span-2">
            <Field label="Address"><Input name="address" maxLength={300} defaultValue={institute.address ?? ""} /></Field>
          </div>
          <Field label="Status">
            <Select name="status" defaultValue={institute.status}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
          </Field>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function DeleteInstituteButton({
  institute,
  /** Where to go once the institute is gone — the detail page can't refresh into a deleted record. */
  redirectTo,
}: {
  institute: Pick<InstituteRow, "id" | "name" | "code">;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setConfirmCode("");
    setError(null);
  };

  const run = async () => {
    setPending(true); setError(null);
    const fd = new FormData();
    fd.set("id", institute.id);
    fd.set("code", confirmCode);
    const result = await withMinDelay(deleteInstitute(fd));
    setPending(false);
    if (result?.error) return setError(result.error);
    setOpen(false);
    setConfirmCode("");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Delete institute ${institute.name}`}
        className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
      >
        <Trash2 className="h-3.5 w-3.5" />Delete
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Delete institute"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={run}
              loading={pending}
              disabled={confirmCode.trim().toUpperCase() !== institute.code.toUpperCase()}
            >
              Delete institute
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Delete <span className="font-semibold">{institute.name}</span> and everything inside it — users,
          academic years, classes, divisions, students, fee structures and assignments, accounts and
          expense categories?
        </p>
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          An institute with fee receipts, expense vouchers or ledger transactions cannot be deleted —
          suspend it instead.
        </p>
        <div className="mt-3">
          <Field label={`Type ${institute.code} to confirm`}>
            <Input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              autoComplete="off"
              placeholder={institute.code}
            />
          </Field>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}
      </Modal>
    </>
  );
}

export function NewInstituteButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New institute</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create institute"
        description="Provision a new tenant. You can assign admins after creation."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-institute-form" type="submit" disabled={pending} loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-institute-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true); setError(null);
            const result = await withMinDelay(createInstitute(fd));
            setPending(false);
            if (result?.error) return setError(result.error);
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Name"><Input name="name" required maxLength={120} /></Field>
          <Field label="Code" hint="Short unique identifier"><Input name="code" required maxLength={20} /></Field>
          <Field label="Email"><Input name="email" type="email" maxLength={200} /></Field>
          <Field label="Phone"><Input name="phone" maxLength={40} /></Field>
          <div className="sm:col-span-2">
            <Field label="Address"><Input name="address" maxLength={300} /></Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
