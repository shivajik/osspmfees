"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { deleteRecord, type DeletableKind } from "@/app/(app)/delete-actions";
import { withMinDelay } from "@/lib/utils";

export function DeleteButton({
  kind,
  id,
  label,
  what = "record",
  note,
  compact = true,
}: {
  kind: DeletableKind;
  id: string;
  /** Name of the record shown in the confirmation. */
  label: string;
  /** Human word for the entity, e.g. "class", "student". */
  what?: string;
  note?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  const run = async () => {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("id", id);
    const r = await withMinDelay(deleteRecord(fd));
    setPending(false);
    if (r?.error) return setError(r.error);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        variant="ghost"
        size={compact ? "sm" : "md"}
        onClick={() => setOpen(true)}
        aria-label={`Delete ${what} ${label}`}
        className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
      >
        <Trash2 className="h-4 w-4" />
        {!compact && "Delete"}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={`Delete ${what}`}
        description={`This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
            <Button variant="danger" onClick={run} loading={pending}>Delete</Button>
          </>
        }
      >
        <p className="text-sm">
          Delete <span className="font-semibold">{label}</span>?
        </p>
        {note && <p className="mt-2 text-xs text-[var(--color-fg-muted)]">{note}</p>}
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}
      </Modal>
    </>
  );
}
