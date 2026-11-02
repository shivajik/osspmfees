"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { HeadsEditor } from "../_actions";
import { setupStudentFees } from "../actions";
import { withMinDelay } from "@/lib/utils";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Counter-side fee setup for a student who has nothing to pay against yet.
 * Either reuse a shared structure, or type the heads for this student alone —
 * the common case in village schools, where no two students pay the same.
 */
type Year = { id: string; name: string; isActive?: boolean };
type StructureOption = { id: string; name: string; className: string; yearName: string; totalAmount: number };

/**
 * The default counter flow: staff type whatever this student will pay for the
 * year — one number, no structures, no concession bookkeeping.
 */
function SimpleFeesForm({
  student, years, previousDue,
}: {
  student: { id: string; name: string };
  years: Year[];
  previousDue: number;
}) {
  const defaultYearId = years.find((y) => y.isActive)?.id ?? years[0]?.id ?? "";
  const [yearId, setYearId] = useState(defaultYearId);
  const [amountN, setAmountN] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Old dues only roll in when fees are set for the current year.
  const carried = years.find((y) => y.id === yearId)?.isActive ? previousDue : 0;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (amountN <= 0) return setError("Enter the fee for this student");

        // Heads come from the editor's hidden "items" field.
        const fd = new FormData(e.currentTarget);
        fd.set("studentId", student.id);
        fd.set("mode", "CUSTOM");
        fd.set("academicYearId", yearId);
        fd.set("carryForward", "on");

        setPending(true);
        const r = await withMinDelay(setupStudentFees(fd));
        if (r?.error) {
          setPending(false);
          return setError(r.error);
        }
        router.push(`/fees/collect/${r?.assignmentId}`);
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <HeadsEditor defaultHead="Tuition fee" onTotalChange={setAmountN} />
      <Field label="Academic year">
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? " (current)" : ""}</option>)}
        </Select>
      </Field>

      {carried > 0 && (
        <div className="sm:col-span-2 rounded-md bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">This year</span><span className="font-semibold">{inr(amountN)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">+ Old unpaid balance</span><span className="font-semibold">{inr(carried)}</span></div>
          <div className="mt-1 flex justify-between border-t border-[var(--color-border)] pt-1"><span>Total to collect</span><span className="font-bold">{inr(amountN + carried)}</span></div>
        </div>
      )}

      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending} loading={pending}>
          <CreditCard className="h-4 w-4" />Save &amp; collect
        </Button>
      </div>
    </form>
  );
}

export function SetupFeesPanel({
  student,
  structures,
  years,
  hasExisting = false,
  previousDue = 0,
}: {
  student: { id: string; name: string };
  structures: StructureOption[];
  years: Year[];
  /** Changes the wording when the student already has fees and this adds another. */
  hasExisting?: boolean;
  /** Unpaid balance from earlier years that will be carried in. */
  previousDue?: number;
}) {
  // New students get the two-number form; the full form (heads, shared
  // structures) stays one click away for staff who need it.
  const [advanced, setAdvanced] = useState(hasExisting);
  if (!advanced) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-fg-muted)]">No fees are set for {student.name} yet. Enter the fee and start collecting.</p>
        <SimpleFeesForm student={student} years={years} previousDue={previousDue} />
        <button type="button" onClick={() => setAdvanced(true)} className="self-start text-xs text-[var(--color-brand)] hover:underline">
          More options — separate fee heads (exam, admission…) or a ready fee structure
        </button>
      </div>
    );
  }
  return <FullFeesForm student={student} structures={structures} years={years} hasExisting={hasExisting} />;
}

function FullFeesForm({
  student, structures, years, hasExisting,
}: {
  student: { id: string; name: string };
  structures: StructureOption[];
  years: Year[];
  hasExisting: boolean;
}) {
  const hasStructures = structures.length > 0;
  const [mode, setMode] = useState<"STRUCTURE" | "CUSTOM">(hasStructures ? "STRUCTURE" : "CUSTOM");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const defaultYearId = years.find((y) => y.isActive)?.id ?? years[0]?.id ?? "";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-fg-muted)]">
        {hasExisting ? "Charge this student something extra." : "No fees are set for this student yet."}{" "}
        {hasStructures
          ? "Use a ready fee structure, or enter what this student pays."
          : "Enter what this student pays — no fee structure is needed."}
      </p>

      {hasStructures && (
        <div className="flex gap-2">
          {([
            ["STRUCTURE", "Use a fee structure"],
            ["CUSTOM", "Custom fees for this student"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                mode === value
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium"
                  : "border-[var(--color-border)] text-[var(--color-fg-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setPending(true); setError(null);
          const r = await withMinDelay(setupStudentFees(fd));
          if (r?.error) {
            setPending(false);
            return setError(r.error);
          }
          // Stays pending until the collection screen takes over.
          router.push(`/fees/collect/${r?.assignmentId}`);
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="studentId" value={student.id} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "STRUCTURE" ? (
          <div className="sm:col-span-2">
            <Field label="Fee structure *">
              <Select name="feeStructureId" required>
                {structures.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {fs.name} — {fs.className} / {fs.yearName} ({inr(fs.totalAmount)})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <>
            <Field label="Fee name" hint="Shown on the receipt — optional">
              <Input name="name" maxLength={120} placeholder={`Fees ${years.find((y) => y.id === defaultYearId)?.name ?? ""}`} />
            </Field>
            <Field label="Academic year *">
              <Select name="academicYearId" defaultValue={defaultYearId} required>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}{y.isActive ? " (current)" : ""}</option>
                ))}
              </Select>
            </Field>
            <HeadsEditor />
          </>
        )}

        <Field label="Discount / concession" hint="Optional — deducted from the total">
          <Input name="discount" type="number" min="0" step="1" defaultValue={0} />
        </Field>
        <Field label="Discount reason / given by" hint="Your name is recorded as the approver">
          <Input name="discountReason" maxLength={160} placeholder="Staff ward concession" />
        </Field>

        <label className="sm:col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="carryForward" defaultChecked className="h-4 w-4" />
          Carry forward unpaid balance from earlier academic years
        </label>

        {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" disabled={pending} loading={pending}>
            <CreditCard className="h-4 w-4" />Save &amp; collect
          </Button>
        </div>
      </form>
    </div>
  );
}
