"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { collectFee, createStructure, assignFees } from "./actions";

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
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState<number>(balance);
  const router = useRouter();

  const defaultAccount = accounts.find((a) => (mode === "CASH" ? a.type === "CASH" : a.type === "BANK"));
  const safeAmount = Number.isFinite(amount) ? Math.min(Math.max(amount, 0), balance) : 0;
  const remaining = balance - safeAmount;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" />Collect
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`Collect fee — ${studentName}`}
        description={`Outstanding balance: ${inr(balance)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="collect-fee" type="submit" disabled={pending || safeAmount <= 0}>Record payment</Button>
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

          <div className="sm:col-span-2">
            <Field label="Payment type">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setKind("FULL"); setAmount(balance); }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "FULL" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
                >
                  Full payment ({inr(balance)})
                </button>
                <button
                  type="button"
                  onClick={() => { setKind("PARTIAL"); setAmount(0); }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "PARTIAL" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
                >
                  Partial payment
                </button>
              </div>
            </Field>
          </div>

          <Field label="Amount received" hint={`Max ${inr(balance)}`}>
            <Input
              name="amount" type="number" min="1" max={balance} step="1" required
              value={Number.isFinite(amount) ? String(amount) : ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAmount(v);
                setKind(v >= balance ? "FULL" : "PARTIAL");
              }}
            />
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

          <div className="sm:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">Paying now</span>
              <span className="font-semibold">{inr(safeAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">Remaining after this payment</span>
              <span className={`font-semibold ${remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>{inr(remaining)}</span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
              {remaining === 0
                ? "This clears the balance — the assignment will be marked PAID."
                : `Partial payment — the assignment stays PARTIAL with ${inr(remaining)} due.`}
            </p>
          </div>

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

export function AssignFeesButton({
  structures, students, label = "Assign fees",
}: {
  structures: { id: string; name: string; className: string; yearName: string; totalAmount: number }[];
  students: { id: string; name: string; admissionNo: string; className: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [scope, setScope] = useState<"CLASS" | "ONE">("CLASS");
  const router = useRouter();

  const noStructures = structures.length === 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" />{label}
      </Button>
      <Modal
        open={open} onClose={() => { setOpen(false); setDone(null); setError(null); }}
        title="Assign fees to students"
        description="An assignment is what makes a student collectable. Create one per student, then use Collect on the Assignments table."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); setDone(null); setError(null); }}>Close</Button>
            <Button form="assign-fees" type="submit" disabled={pending || noStructures}>Assign</Button>
          </>
        }
      >
        {noStructures ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            Create a fee structure first (the “Fee structure” button), then come back here to assign it to students.
          </p>
        ) : (
        <form
          id="assign-fees"
          action={async (fd) => {
            setPending(true); setError(null); setDone(null);
            const r = await assignFees(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setDone(r?.created ?? 0);
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3"
        >
          <Field label="Fee structure">
            <Select name="feeStructureId" required>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.className} / {s.yearName} (₹{s.totalAmount.toLocaleString("en-IN")})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assign to">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope("CLASS")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${scope === "CLASS" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
              >
                All students in class
              </button>
              <button
                type="button"
                onClick={() => setScope("ONE")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${scope === "ONE" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
              >
                One student
              </button>
            </div>
          </Field>

          {scope === "ONE" && (
            <Field label="Student" hint="Manual override — ignores class / academic-year matching">
              <Select name="studentId" required>
                {students.length === 0 && <option value="">No students yet</option>}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.admissionNo} · {s.className}</option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Discount per student" hint="Optional flat discount deducted from the structure total">
            <Input name="discount" type="number" min="0" step="1" defaultValue={0} />
          </Field>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {done !== null && <p className="text-xs text-emerald-600">{done} assignment(s) created — close this dialog and use “Collect” in the Assignments table.</p>}
        </form>
        )}
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
