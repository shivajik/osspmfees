"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createClass, updateClass } from "./actions";
import { withMinDelay } from "@/lib/utils";
import { STREAMS, STREAM_SUFFIX, classLevel, classStream, normalizeClassName } from "@/lib/academics";

/** Name + code + stream (stream only for classes 11 and 12). */
function ClassFields({ initial }: { initial?: { name: string; code?: string } }) {
  const initialStream = initial ? classStream(initial.name) : "";
  const initialBase = initial
    ? normalizeClassName(initial.name).replace(STREAM_SUFFIX, "")
    : "";
  const [name, setName] = useState(initialBase);
  const [stream, setStream] = useState<string>(initialStream);
  const level = classLevel(name);
  const showStream = level === 11 || level === 12 || !!stream;
  const preview = name.trim() ? normalizeClassName(stream ? `${normalizeClassName(name)} ${stream}` : name) : "";
  return (
    <>
      <Field label="Class *" hint="e.g. 8, 11, XI, Nursery">
        <Input name="name" required maxLength={60} placeholder="11" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Code" hint="Optional">
        <Input name="code" maxLength={20} placeholder="11A" defaultValue={initial?.code ?? ""} />
      </Field>
      {showStream && (
        <div className="sm:col-span-2">
          <Field label="Stream" hint="For 11th / 12th — make one class per stream (11 Arts, 11 Science…)">
            <Select name="stream" value={stream} onChange={(e) => setStream(e.target.value)}>
              <option value="">No stream</option>
              {STREAMS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {preview && (
        <p className="sm:col-span-2 text-xs text-[var(--color-fg-muted)]">
          Will show as <span className="font-semibold text-[var(--color-fg)]">{preview}</span> everywhere — students, fees and reports.
        </p>
      )}
    </>
  );
}

export function NewClassButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New class</Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Create class"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-class" type="submit" disabled={pending} loading={pending}>Create</Button>
          </>
        }
      >
        {open && (
          <form
            id="new-class"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setPending(true); setError(null);
              const r = await withMinDelay(createClass(fd));
              setPending(false);
              if (r?.error) return setError(r.error);
              setOpen(false); router.refresh();
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <ClassFields />
            {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}

export function EditClassButton({ cls }: { cls: { id: string; name: string; code?: string } }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const formId = `edit-class-${cls.id}`;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Edit class"
        description="Students and fees stay in this class — only its name / stream changes."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={formId} type="submit" disabled={pending} loading={pending}>Save</Button>
          </>
        }
      >
        {open && (
          <form
            id={formId}
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("id", cls.id);
              setPending(true); setError(null);
              const r = await withMinDelay(updateClass(fd));
              setPending(false);
              if (r?.error) return setError(r.error);
              setOpen(false); router.refresh();
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <ClassFields initial={cls} />
            {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
