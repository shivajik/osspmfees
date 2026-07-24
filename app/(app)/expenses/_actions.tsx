"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createExpense, createCategory } from "./actions";

export function NewExpenseButton({
  categories, accounts,
}: {
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string; type: "BANK" | "CASH" }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!categories.length || !accounts.length}>
        <Plus className="h-4 w-4" />New expense
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Record expense"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-exp" type="submit" disabled={pending}>Save</Button>
          </>
        }
      >
        <form
          id="new-exp"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createExpense(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Field label="Description"><Input name="description" required maxLength={200} /></Field>
          </div>
          <Field label="Amount"><Input name="amount" type="number" min="1" step="1" required /></Field>
          <Field label="Date"><Input name="spentAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label="Category">
            <Select name="categoryId" required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Mode">
            <Select name="mode" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Account">
              <Select name="accountId" required>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </Select>
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function NewCategoryButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FolderPlus className="h-4 w-4" />Category
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="New category"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="new-cat" type="submit" disabled={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-cat"
          action={async (fd) => {
            setPending(true); setError(null);
            const r = await createCategory(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
        >
          <Field label="Name"><Input name="name" required maxLength={80} /></Field>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
