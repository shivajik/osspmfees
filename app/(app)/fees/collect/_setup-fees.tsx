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
export function SetupFeesPanel({
  student,
  structures,
  years,
  hasExisting = false,
}: {
  student: { id: string; name: string };
  structures: { id: string; name: string; className: string; yearName: string; totalAmount: number }[];
  years: { id: string; name: string; isActive?: boolean }[];
  /** Changes the wording when the student already has fees and this adds another. */
  hasExisting?: boolean;
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
