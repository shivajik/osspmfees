"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createStudent, updateStudent } from "./actions";

type Ref = { id: string; name: string };
type BatchRef = { id: string; name: string; classId: string };

export type StudentRow = {
  id: string; admissionNo: string; name: string;
  guardianName?: string; phone?: string; email?: string;
  classId: string; batchId: string; academicYearId: string;
  status: "ACTIVE" | "INACTIVE";
};

export function EditStudentButton({
  student, classes, batches, years,
}: {
  student: StudentRow;
  classes: Ref[];
  batches: BatchRef[];
  years: Ref[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState(student.classId);
  const router = useRouter();
  const filteredBatches = batches.filter((b) => b.classId === classId);
  const formId = `edit-student-${student.id}`;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />Edit
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title={`Edit ${student.name}`}
        description="Update enrollment details, contact information, or status."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={formId} type="submit" disabled={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={formId}
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await updateStudent(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={student.id} />
          <Field label="Admission number"><Input name="admissionNo" required maxLength={40} defaultValue={student.admissionNo} /></Field>
          <Field label="Full name"><Input name="name" required maxLength={120} defaultValue={student.name} /></Field>
          <Field label="Guardian"><Input name="guardianName" maxLength={120} defaultValue={student.guardianName ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" maxLength={40} defaultValue={student.phone ?? ""} /></Field>
          <div className="sm:col-span-2">
            <Field label="Email"><Input name="email" type="email" maxLength={200} defaultValue={student.email ?? ""} /></Field>
          </div>
          <Field label="Class">
            <Select name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Batch">
            <Select name="batchId" defaultValue={student.batchId} required key={classId}>
              {filteredBatches.length === 0 && <option value="">— no batches —</option>}
              {filteredBatches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Academic year">
            <Select name="academicYearId" defaultValue={student.academicYearId} required>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={student.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

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
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
