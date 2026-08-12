"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { collectFee, createStructure, updateStructure, assignFees, updateAssignment, updatePayment } from "./actions";
import { FEE_HEADS } from "@/lib/fee-heads";

type Mode = "CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE";
type Cheque = { chequeNo: string; chequeDate: string; bankName: string; branch?: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function ModeSelect({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <Select name="mode" value={value} onChange={(e) => onChange(e.target.value as Mode)}>
      <option value="CASH">Cash</option>
      <option value="BANK">Bank transfer</option>
      <option value="UPI">UPI</option>
      <option value="CARD">Card</option>
      <option value="CHEQUE">Cheque</option>
      <option value="ONLINE">Online gateway</option>
    </Select>
  );
}

function ChequeFields({ defaults }: { defaults?: Cheque }) {
  return (
    <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs font-medium">Cheque details</p>
      <Field label="Cheque number *"><Input name="chequeNo" required maxLength={40} defaultValue={defaults?.chequeNo ?? ""} /></Field>
      <Field label="Cheque date *">
        <Input name="chequeDate" type="date" required defaultValue={(defaults?.chequeDate ?? new Date().toISOString()).slice(0, 10)} />
      </Field>
      <Field label="Bank name *"><Input name="chequeBank" required maxLength={80} defaultValue={defaults?.bankName ?? ""} /></Field>
      <Field label="Branch" hint="Optional"><Input name="chequeBranch" maxLength={80} defaultValue={defaults?.branch ?? ""} /></Field>
    </div>
  );
}

export function CollectFeeButton({
  assignmentId, studentName, balance, previousDue, accounts,
}: {
  assignmentId: string;
  studentName: string;
  balance: number;
  previousDue?: number;
  accounts: { id: string; name: string; type: "BANK" | "CASH" }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("CASH");
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState<number>(balance);
  const [discount, setDiscount] = useState<number>(0);
  const router = useRouter();

  const defaultAccount = accounts.find((a) => (mode === "CASH" ? a.type === "CASH" : a.type === "BANK"));
  const safeDiscount = Number.isFinite(discount) ? Math.min(Math.max(discount, 0), balance) : 0;
  const safeAmount = Number.isFinite(amount) ? Math.min(Math.max(amount, 0), balance - safeDiscount) : 0;
  const settled = safeAmount + safeDiscount;
  const remaining = balance - settled;
  const prevDue = previousDue ?? 0;
  const toPrevious = Math.min(settled, prevDue);
  const toCurrent = settled - toPrevious;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" />Collect
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`Collect fee — ${studentName}`}
        description={prevDue > 0
          ? `Outstanding ${inr(balance)} — includes ${inr(prevDue)} carried forward from earlier years`
          : `Outstanding balance: ${inr(balance)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="collect-fee" type="submit" disabled={pending || settled <= 0}>Record payment</Button>
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
                  onClick={() => { setKind("FULL"); setAmount(balance - safeDiscount); }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "FULL" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
                >
                  Full payment ({inr(Math.max(0, balance - safeDiscount))})
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

          <Field label="Amount received *" hint={`Max ${inr(Math.max(0, balance - safeDiscount))}`}>
            <Input
              name="amount" type="number" min="0" max={Math.max(0, balance - safeDiscount)} step="1" required
              value={Number.isFinite(amount) ? String(amount) : ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAmount(v);
                setKind(v >= balance - safeDiscount ? "FULL" : "PARTIAL");
              }}
            />
          </Field>
          <Field label="Mode *"><ModeSelect value={mode} onChange={setMode} /></Field>

          <div className="sm:col-span-2">
            <Field label="Fee type / head *" hint="What this payment is being collected for">
              <Select name="feeHead" defaultValue={FEE_HEADS[0]} required>
                {FEE_HEADS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
          </div>


          <Field label="Discount / concession" hint="Counts as fees paid — no money is received">
            <Input
              name="discount" type="number" min="0" max={balance} step="1"
              value={Number.isFinite(discount) ? String(discount) : ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </Field>
          <Field label="Discount reason / approved by" hint="Your name is recorded as the approver">
            <Input name="discountReason" maxLength={160} placeholder="Sibling concession" />
          </Field>

          <div className="sm:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            {prevDue > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-fg-muted)]">Adjusted against previous year balance</span>
                  <span className="font-semibold">{inr(toPrevious)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[var(--color-fg-muted)]">Adjusted against current year fees</span>
                  <span className="font-semibold">{inr(toCurrent)}</span>
                </div>
                <div className="my-2 border-t border-[var(--color-border)]" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">Paying now</span>
              <span className="font-semibold">{inr(safeAmount)}</span>
            </div>
            {safeDiscount > 0 && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[var(--color-fg-muted)]">Discount granted</span>
                <span className="font-semibold text-[var(--color-brand)]">{inr(safeDiscount)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">Remaining after this payment</span>
              <span className={`font-semibold ${remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>{inr(remaining)}</span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <Field label="Account *">
              <Select name="accountId" defaultValue={defaultAccount?.id ?? ""} required>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </Select>
            </Field>
          </div>
          {mode === "CHEQUE" && <ChequeFields />}
          <div className="sm:col-span-2">
            <Field label="Reference" hint="Transaction ID / remarks (optional)">
              <Input name="reference" maxLength={80} />
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function EditPaymentButton({
  payment,
}: {
  payment: { id: string; receiptNo: string; amount: number; mode: Mode; reference?: string; cheque?: Cheque };
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(payment.mode);
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`Edit receipt ${payment.receiptNo}`}
        description="Balances and account ledgers are re-adjusted automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={`edit-pay-${payment.id}`} type="submit" disabled={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={`edit-pay-${payment.id}`}
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await updatePayment(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="paymentId" value={payment.id} />
          <Field label="Amount *"><Input name="amount" type="number" min="1" step="1" required defaultValue={payment.amount} /></Field>
          <Field label="Mode *"><ModeSelect value={mode} onChange={setMode} /></Field>
          {mode === "CHEQUE" && <ChequeFields defaults={payment.cheque} />}
          <div className="sm:col-span-2">
            <Field label="Reference"><Input name="reference" maxLength={80} defaultValue={payment.reference ?? ""} /></Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function EditAssignmentButton({
  assignment,
}: {
  assignment: {
    id: string; studentName: string; structureTotal: number; discount: number;
    discountReason?: string; discountByName?: string; previousBalance: number; totalPaid: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discount, setDiscount] = useState(assignment.discount);
  const [prev, setPrev] = useState(assignment.previousBalance);
  const router = useRouter();

  const payable = Math.max(0, assignment.structureTotal - (Number.isFinite(discount) ? discount : 0));
  const gross = payable + (Number.isFinite(prev) ? prev : 0);

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`Edit fee assignment — ${assignment.studentName}`}
        description="Change the discount or the carried-forward previous balance."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={`edit-assn-${assignment.id}`} type="submit" disabled={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={`edit-assn-${assignment.id}`}
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await updateAssignment(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <Field label="Discount *" hint={`Structure total ${inr(assignment.structureTotal)}`}>
            <Input
              name="discount" type="number" min="0" max={assignment.structureTotal} step="1" required
              value={Number.isFinite(discount) ? String(discount) : ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </Field>
          <Field label="Previous year balance" hint="Carried forward dues">
            <Input
              name="previousBalance" type="number" min="0" step="1"
              value={Number.isFinite(prev) ? String(prev) : ""}
              onChange={(e) => setPrev(Number(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Discount reason / approved by note" hint={assignment.discountByName ? `Currently recorded by ${assignment.discountByName}` : "Your name is recorded automatically"}>
              <Input name="discountReason" maxLength={160} defaultValue={assignment.discountReason ?? ""} placeholder="Sibling concession" />
            </Field>
          </div>
          <div className="sm:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-[var(--color-fg-muted)]">Current year payable</span><span className="font-semibold">{inr(payable)}</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-[var(--color-fg-muted)]">+ Previous balance</span><span className="font-semibold">{inr(Number.isFinite(prev) ? prev : 0)}</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-[var(--color-fg-muted)]">Total due</span><span className="font-semibold">{inr(gross)}</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-[var(--color-fg-muted)]">Already collected</span><span className="font-semibold text-emerald-600">{inr(assignment.totalPaid)}</span></div>
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
  const [done, setDone] = useState<{ created: number; carried: number } | null>(null);
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
        description="Unpaid dues from earlier academic years are carried forward as the student's previous balance."
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
            setDone({ created: r?.created ?? 0, carried: r?.carried ?? 0 });
            router.refresh();
          }}
          className="grid grid-cols-1 gap-3"
        >
          <Field label="Fee structure *">
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
            <Field label="Student *" hint="Manual override — ignores class matching">
              <Select name="studentId" required>
                {students.length === 0 && <option value="">No students yet</option>}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.admissionNo} · {s.className}</option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Discount per student" hint="Flat discount deducted from the structure total">
            <Input name="discount" type="number" min="0" step="1" defaultValue={0} />
          </Field>
          <Field label="Discount reason / given by" hint="Your name is recorded automatically as the approver">
            <Input name="discountReason" maxLength={160} placeholder="Staff ward concession" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="carryForward" defaultChecked className="h-4 w-4" />
            Carry forward unpaid balance from earlier academic years
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {done && (
            <p className="text-xs text-emerald-600">
              {done.created} assignment(s) created{done.carried > 0 ? ` · ${inr(done.carried)} carried forward as previous balance` : ""} — use “Collect” in the Assignments table.
            </p>
          )}
        </form>
        )}
      </Modal>
    </>
  );
}

function StructureFields({
  classes, years, structure,
}: {
  classes: { id: string; name: string }[];
  years: { id: string; name: string }[];
  structure?: { id: string; name: string; totalAmount: number; classId: string; academicYearId: string; items: { head: string; amount: number }[] };
}) {
  return (
    <>
      {structure && <input type="hidden" name="id" value={structure.id} />}
      <Field label="Name *"><Input name="name" required maxLength={120} defaultValue={structure?.name ?? ""} placeholder="Grade X Annual Fees" /></Field>
      <Field label="Total amount *"><Input name="totalAmount" type="number" min="1" step="1" required defaultValue={structure?.totalAmount ?? ""} /></Field>
      <Field label="Class *">
        <Select name="classId" required defaultValue={structure?.classId}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Academic year *">
        <Select name="academicYearId" required defaultValue={structure?.academicYearId}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Heads" hint={`Format: Head:Amount, comma separated. Standard heads: ${FEE_HEADS.join(", ")}`}>
          <datalist id="fee-heads">
            {FEE_HEADS.map((h) => <option key={h} value={`${h}:`} />)}
          </datalist>
          <Input
            list="fee-heads"
            name="items" placeholder="Eligibility fees:500, I unit test:300"
            defaultValue={structure ? structure.items.map((i) => `${i.head}:${i.amount}`).join(", ") : ""}
          />
        </Field>
      </div>
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
          <StructureFields classes={classes} years={years} />
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function EditStructureButton({
  structure, classes, years,
}: {
  structure: { id: string; name: string; totalAmount: number; classId: string; academicYearId: string; items: { head: string; amount: number }[] };
  classes: { id: string; name: string }[];
  years: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title="Edit fee structure"
        description="Existing assignments are re-priced (structure total − each student's discount)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={`edit-fs-${structure.id}`} type="submit" disabled={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={`edit-fs-${structure.id}`}
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await updateStructure(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <StructureFields classes={classes} years={years} structure={structure} />
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
