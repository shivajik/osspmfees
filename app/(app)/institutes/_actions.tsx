"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createInstitute, updateInstitute } from "./actions";

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
          action={async (fd) => {
            setPending(true); setError(null);
            const result = await updateInstitute(fd);
            setPending(false);
            if (result?.error) return setError(result.error);
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={institute.id} />
          <Field label="Name"><Input name="name" required maxLength={120} defaultValue={institute.name} /></Field>
          <Field label="Code" hint="Short unique identifier"><Input name="code" required maxLength={20} defaultValue={institute.code} /></Field>
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
          action={async (fd) => {
            setPending(true); setError(null);
            const result = await createInstitute(fd);
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
