"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { importStudents } from "./import-actions";
import type { ImportSummary } from "@/lib/import/types";

export function ImportStudentsButton({ years }: { years: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const router = useRouter();

  async function run(dryRun: boolean) {
    const form = document.getElementById("import-students") as HTMLFormElement | null;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("dryRun", dryRun ? "1" : "0");
    setPending(true); setError(null);
    const r = await importStudents(fd);
    setPending(false);
    if (r.error) { setResult(null); setError(r.error); return; }
    setResult(r);
    if (!dryRun) router.refresh();
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} disabled={!years.length}>
        <Upload className="h-4 w-4" />Import from Excel
      </Button>
      <Modal
        open={open}
        onClose={() => { setOpen(false); setResult(null); setError(null); }}
        title="Import students from Excel"
        description="Upload an .xlsx or .csv list. Column headers are detected automatically (GR/PRN/Jr.No, Student Name, Class/Std, Div/Section, Mobile, Pending balance, Assigned fee, Discount)."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); setResult(null); setError(null); }}>Close</Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(true)}>Preview</Button>
            <Button disabled={pending} onClick={() => run(false)}>Import</Button>
          </>
        }
      >
        <form id="import-students" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Spreadsheet file" hint="Every sheet in the workbook is scanned. Max 8 MB.">
              <Input name="file" type="file" accept=".xlsx,.xls,.csv" required />
            </Field>
          </div>
          <Field label="Academic year">
            <Select name="academicYearId" required>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <Field label="Import fee columns">
            <Select name="importFees" defaultValue="1">
              <option value="1">Yes — save pending balance, assigned fee & discount</option>
              <option value="0">No — students only</option>
            </Select>
          </Field>
          <Field label="Duplicate admission numbers" hint="Sheets that repeat a class code (e.g. JR.KG.1) get a unique suffix automatically">
            <Select name="onDuplicate" defaultValue="autonumber">
              <option value="autonumber">Allow — auto-number duplicates</option>
              <option value="skip">Skip duplicate rows</option>
            </Select>
          </Field>
          <Field label="Default class" hint="Used only when the sheet has no class column">
            <Input name="defaultClass" maxLength={40} />
          </Field>
          <Field label="Default division" hint="Defaults to A">
            <Input name="defaultSection" maxLength={20} />
          </Field>

        </form>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        {result && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <div className="mb-1 font-medium">
                {result.dryRun ? "Preview — nothing saved yet" : "Import complete"}
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-fg-muted)]">
                <li>Rows read: <span className="font-medium text-[var(--color-fg)]">{result.parsed}</span></li>
                <li>New students: <span className="font-medium text-[var(--color-fg)]">{result.studentsCreated}</span></li>
                <li>Existing updated: <span className="font-medium text-[var(--color-fg)]">{result.studentsUpdated}</span></li>
                <li>Classes added: <span className="font-medium text-[var(--color-fg)]">{result.classesCreated?.length ?? 0}</span></li>
                <li>Fee records: <span className="font-medium text-[var(--color-fg)]">{result.feeAssignments}</span></li>
                <li>Fees assigned: <span className="font-medium text-[var(--color-fg)]">{formatCurrency(result.feesTotal ?? 0)}</span></li>
                <li>Previous balance: <span className="font-medium text-[var(--color-fg)]">{formatCurrency(result.previousTotal ?? 0)}</span></li>
                <li>Discount: <span className="font-medium text-[var(--color-fg)]">{formatCurrency(result.discountTotal ?? 0)}</span></li>
              </ul>
            </div>

            {!!result.preview?.length && (
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-bg-subtle)] text-left">
                    <tr>
                      <th className="p-2">Adm #</th><th className="p-2">Name</th><th className="p-2">Class</th>
                      <th className="p-2">Div</th><th className="p-2">Mobile</th><th className="p-2">Pending</th>
                      <th className="p-2">Fee</th><th className="p-2">Discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((p) => (
                      <tr key={`${p.admissionNo}-${p.name}`} className="border-t border-[var(--color-border)]">
                        <td className="p-2 font-mono">{p.admissionNo}</td>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2">{p.className}</td>
                        <td className="p-2">{p.section}</td>
                        <td className="p-2">{p.phone ?? "—"}</td>
                        <td className="p-2">{p.previousBalance}</td>
                        <td className="p-2">{p.assignedFee}</td>
                        <td className="p-2">{p.discount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!!result.errors?.length && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30">
                <div className="mb-1 font-medium">Rows needing attention</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {result.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
