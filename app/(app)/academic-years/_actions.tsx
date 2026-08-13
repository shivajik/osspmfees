"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Field } from "@/components/ui/input";
import { createAcademicYear } from "./actions";

export function NewAcademicYearButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New year</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create academic year"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-ay" type="submit" disabled={pending} loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-ay"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createAcademicYear(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Name (e.g. 2025-26)"><Input name="name" required maxLength={20} /></Field>
          <div className="flex items-center gap-2 pt-6">
            <input id="isActive" name="isActive" type="checkbox" />
            <label htmlFor="isActive" className="text-xs text-[var(--color-fg-muted)]">Set as current year</label>
          </div>
          <Field label="Start date"><Input name="startDate" type="date" required /></Field>
          <Field label="End date"><Input name="endDate" type="date" required /></Field>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
