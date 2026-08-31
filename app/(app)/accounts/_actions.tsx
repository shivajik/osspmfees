"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createAccount, updateAccount } from "./actions";

export function NewAccountButton({
  isSuper,
  institutes,
}: {
  isSuper?: boolean;
  institutes?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"BANK" | "CASH">("BANK");
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New account</Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Create account"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-acc" type="submit" disabled={pending} loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-acc"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true); setError(null);
            const r = await createAccount(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {isSuper && (
            <div className="sm:col-span-2">
              <Field label="Institute">
                <Select name="instituteId" required defaultValue="">
                  <option value="" disabled>Select an institute…</option>
                  {institutes?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <Field label="Name"><Input name="name" required maxLength={120} /></Field>
          <Field label="Type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as "BANK" | "CASH")}>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
            </Select>
          </Field>
          {type === "BANK" && (
            <>
              <Field label="Bank name"><Input name="bankName" maxLength={120} /></Field>
              <Field label="Account #"><Input name="accountNo" maxLength={40} /></Field>
              <Field label="IFSC"><Input name="ifsc" maxLength={20} /></Field>
            </>
          )}
          <Field label="Opening balance"><Input name="openingBal" type="number" min="0" step="1" defaultValue="0" required /></Field>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function EditAccountButton({
  account,
}: {
  account: { id: string; name: string; type: "BANK" | "CASH"; bankName?: string; accountNo?: string; ifsc?: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"BANK" | "CASH">(account.type);
  const router = useRouter();
  const formId = `edit-acc-${account.id}`;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Edit account">
        <Pencil className="h-3.5 w-3.5" />Edit
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title={`Edit ${account.name}`}
        description="Fixes a mistyped name, account number, or IFSC — does not affect the balance."
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
            const r = await updateAccount(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={account.id} />
          <Field label="Name"><Input name="name" required maxLength={120} defaultValue={account.name} /></Field>
          <Field label="Type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as "BANK" | "CASH")}>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
            </Select>
          </Field>
          {type === "BANK" && (
            <>
              <Field label="Bank name"><Input name="bankName" maxLength={120} defaultValue={account.bankName ?? ""} /></Field>
              <Field label="Account #"><Input name="accountNo" maxLength={40} defaultValue={account.accountNo ?? ""} /></Field>
              <Field label="IFSC"><Input name="ifsc" maxLength={20} defaultValue={account.ifsc ?? ""} /></Field>
            </>
          )}
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
