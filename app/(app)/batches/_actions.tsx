"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createBatch } from "./actions";

export function NewBatchButton({
  classes, years,
}: { classes: { id: string; name: string }[]; years: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!classes.length || !years.length}>
        <Plus className="h-4 w-4" />New batch
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Create batch"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-batch" type="submit" disabled={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-batch"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createBatch(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Batch name"><Input name="name" required maxLength={40} placeholder="10-A" /></Field>
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
          {error && <p className="sm:col-span-2 text-xs text-red-400">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
