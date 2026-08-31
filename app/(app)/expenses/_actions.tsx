"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderCog, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { createExpense, updateExpense, createCategory, updateCategory, deleteCategory } from "./actions";

type Mode = "CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE";
type Cat = { id: string; name: string };
type Acc = { id: string; name: string; type: "BANK" | "CASH" };

export type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  spentAt: string;
  categoryId: string;
  mode: Mode;
  accountId?: string;
  cheque?: { chequeNo: string; chequeDate: string; bankName: string; branch?: string };
};

function ChequeFields({
  defaults,
}: { defaults?: { chequeNo: string; chequeDate: string; bankName: string; branch?: string } }) {
  return (
    <>
      <Field label="Cheque number *">
        <Input name="chequeNo" required maxLength={40} defaultValue={defaults?.chequeNo ?? ""} placeholder="000123" />
      </Field>
      <Field label="Cheque date *">
        <Input
          name="chequeDate" type="date" required
          defaultValue={(defaults?.chequeDate ?? new Date().toISOString()).slice(0, 10)}
        />
      </Field>
      <Field label="Bank name *">
        <Input name="chequeBank" required maxLength={80} defaultValue={defaults?.bankName ?? ""} placeholder="State Bank of India" />
      </Field>
      <Field label="Branch" hint="Optional">
        <Input name="chequeBranch" maxLength={80} defaultValue={defaults?.branch ?? ""} />
      </Field>
    </>
  );
}

function ExpenseForm({
  id, categories, accounts, row,
}: { id: string; categories: Cat[]; accounts: Acc[]; row?: ExpenseRow }) {
  const [mode, setMode] = useState<Mode>(row?.mode ?? "CASH");
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="sm:col-span-2">
        <Field label="Description *"><Input name="description" required maxLength={200} defaultValue={row?.description ?? ""} /></Field>
      </div>
      <Field label="Amount *"><Input name="amount" type="number" min="1" step="1" required defaultValue={row?.amount ?? ""} /></Field>
      <Field label="Date *">
        <Input name="spentAt" type="date" required defaultValue={(row?.spentAt ?? new Date().toISOString()).slice(0, 10)} />
      </Field>
      <Field label="Category *">
        <Select name="categoryId" required defaultValue={row?.categoryId}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Mode *">
        <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank</option>
          <option value="UPI">UPI</option>
          <option value="CARD">Card</option>
          <option value="CHEQUE">Cheque</option>
          <option value="ONLINE">Online</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Account *">
          <Select name="accountId" required defaultValue={row?.accountId}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </Select>
        </Field>
      </div>
      {mode === "CHEQUE" && (
        <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-xs font-medium">Cheque details</p>
          <ChequeFields defaults={row?.cheque} />
        </div>
      )}
      <input type="hidden" name="__form" value={id} />
    </>
  );
}

export function NewExpenseButton({ categories, accounts }: { categories: Cat[]; accounts: Acc[] }) {
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
            <Button form="new-exp" type="submit" disabled={pending} loading={pending}>Save</Button>
          </>
        }
      >
        <form
          id="new-exp"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true); setError(null);
            const r = await createExpense(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <ExpenseForm id="new-exp" categories={categories} accounts={accounts} />
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function EditExpenseButton({
  row, categories, accounts,
}: { row: ExpenseRow; categories: Cat[]; accounts: Acc[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Edit expense">
        <Pencil className="h-3.5 w-3.5" />Edit
      </Button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Edit expense"
        description="Account balances are re-adjusted automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form={`edit-exp-${row.id}`} type="submit" disabled={pending} loading={pending}>Save changes</Button>
          </>
        }
      >
        <form
          id={`edit-exp-${row.id}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true); setError(null);
            const r = await updateExpense(fd);
            setPending(false);
            if (r?.error) return setError(r.error);
            setOpen(false); router.refresh();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <ExpenseForm id={`edit-exp-${row.id}`} categories={categories} accounts={accounts} row={row} />
          {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function CategoryManagerButton({
  categories,
}: { categories: { id: string; name: string; usage: number }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();

  const run = async (fn: (fd: FormData) => Promise<{ error?: string } | void>, fd: FormData) => {
    setPending(true); setError(null);
    const r = await fn(fd);
    setPending(false);
    if (r?.error) {
      setError(r.error);
      return false;
    }
    setEditing(null);
    router.refresh();
    return true;
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FolderCog className="h-4 w-4" />Categories
      </Button>
      <Modal
        open={open} onClose={() => { setOpen(false); setError(null); setEditing(null); }}
        title="Expense categories"
        description="Add, rename or remove the heads used to classify expenses."
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            if (await run(createCategory, new FormData(form))) form.reset();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field label="New category *"><Input name="name" required maxLength={80} placeholder="Electricity" /></Field>
          </div>
          <Button type="submit" disabled={pending} loading={pending}>Add</Button>
        </form>

        <ul className="mt-4 divide-y divide-[var(--color-border)] text-sm">
          {categories.length === 0 && <li className="py-3 text-xs text-[var(--color-fg-muted)]">No categories yet.</li>}
          {categories.map((c) => (
            <li key={c.id} className="py-2">
              {editing === c.id ? (
                <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); await run(updateCategory, new FormData(e.currentTarget)); }}>
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="name" defaultValue={c.name} required maxLength={80} className="flex-1" />
                  <Button size="sm" type="submit" disabled={pending} loading={pending}>Save</Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-[var(--color-fg-muted)]">{c.usage} expense(s)</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(c.id); setError(null); }}>
                      <Pencil className="h-3.5 w-3.5" />Rename
                    </Button>
                    <form onSubmit={async (e) => { e.preventDefault(); await run(deleteCategory, new FormData(e.currentTarget)); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button size="sm" variant="ghost" type="submit" disabled={pending || c.usage > 0} title={c.usage > 0 ? "In use — rename instead" : "Delete"}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
