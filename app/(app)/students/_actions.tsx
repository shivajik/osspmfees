"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createStudent } from "./actions";

export function NewStudentButton({
  classes, batches, years,
}: {
  classes: { id: string; name: string }[];
  batches: { id: string; name: string; classId: string }[];
  years: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const router = useRouter();
  const filteredBatches = batches.filter((b) => b.classId === classId);

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!classes.length || !years.length}>
        <Plus className="h-4 w-4" />Enroll student
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Enroll student"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-student" type="submit" disabled={pending}>Enroll</Button>
          </>
        }
      >
        <form
          id="new-student"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createStudent(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Admission number"><Input name="admissionNo" required maxLength={40} /></Field>
          <Field label="Full name"><Input name="name" required maxLength={120} /></Field>
          <Field label="Guardian"><Input name="guardianName" maxLength={120} /></Field>
          <Field label="Phone"><Input name="phone" maxLength={40} /></Field>
          <div className="sm:col-span-2">
            <Field label="Email"><Input name="email" type="email" maxLength={200} /></Field>
          </div>
          <Field label="Class">
            <Select name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Batch">
            <Select name="batchId" required>
              {filteredBatches.length === 0 && <option value="">— no batches —</option>}
              {filteredBatches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Academic year">
              <Select name="academicYearId" required>
                {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </Select>
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-400">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
