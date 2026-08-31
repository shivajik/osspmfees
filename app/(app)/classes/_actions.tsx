"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Field } from "@/components/ui/input";
import { createClass } from "./actions";
import { withMinDelay } from "@/lib/utils";

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
          <Field label="Name"><Input name="name" required maxLength={60} placeholder="Grade 10" /></Field>
          <Field label="Code"><Input name="code" maxLength={20} placeholder="10" /></Field>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
