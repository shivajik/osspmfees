"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { collectFee, createStructure } from "./actions";

export function CollectFeeButton({
  assignmentId, studentName, balance, accounts,
}: {
  assignmentId: string;
  studentName: string;
  balance: number;
  accounts: { id: string; name: string; type: "BANK" | "CASH" }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE">("CASH");
  const router = useRouter();

  const defaultAccount = accounts.find((a) => (mode === "CASH" ? a.type === "CASH" : a.type === "BANK"));

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" />Collect
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`Collect fee — ${studentName}`}
        description={`Outstanding balance: ₹${balance.toLocaleString("en-IN")}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="collect-fee" type="submit" disabled={pending}>Record payment</Button>
          </>
        }
      >
        <form
          id="collect-fee"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await collectFee(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false);
            router.push(`/fees/receipts/${r?.paymentId}`);
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <Field label="Amount" hint={`Max ₹${balance.toLocaleString("en-IN")}`}>
            <Input name="amount" type="number" min="1" max={balance} step="1" defaultValue={balance} required />
          </Field>
          <Field label="Mode">
            <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank transfer</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
              <option value="ONLINE">Online gateway</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Account">
              <Select name="accountId" defaultValue={defaultAccount?.id ?? ""} required>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Reference" hint="Transaction ID / cheque number (optional)">
              <Input name="reference" maxLength={80} />
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function NewStructureButton({
  classes, years,
}: { classes: { id: string; name: string }[]; years: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />Fee structure
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title="Create fee structure"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-fs" type="submit" disabled={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-fs"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createStructure(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Name"><Input name="name" required maxLength={120} placeholder="Grade X Annual Fees" /></Field>
          <Field label="Total amount"><Input name="totalAmount" type="number" min="1" step="1" required /></Field>
          <Field label="Class">
            <Select name="classId" required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Academic year">
            <Select name="academicYearId" required>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Heads" hint="Format: Tuition:30000, Exam:5000">
              <Input name="items" placeholder="Tuition:30000, Exam:5000" />
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
