"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createAccount } from "./actions";

export function NewAccountButton() {
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
            <Button form="new-acc" type="submit" disabled={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-acc"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createAccount(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
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
