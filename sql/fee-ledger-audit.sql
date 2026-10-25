-- Fee ledger: conditional charges, head-wise allocation and receipt reversals.
-- Additive and idempotent: safe to run more than once in the Supabase SQL editor.
-- The app keeps working before this runs (the mirror skips unknown columns).

ALTER TABLE "FeeAssignment" ADD COLUMN IF NOT EXISTS "academicYearId"  TEXT;
ALTER TABLE "FeeAssignment" ADD COLUMN IF NOT EXISTS "previousBalance" NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "FeeAssignment" ADD COLUMN IF NOT EXISTS "extraCharges"    JSONB;

ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "feeHeadBreakup"    JSONB;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "appliedToPrevious" NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "appliedToCurrent"  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "discount"          NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "voidedAt"          TIMESTAMP(3);
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "voidedBy"          TEXT;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "voidReason"        TEXT;
ALTER TABLE "FeePayment" ADD COLUMN IF NOT EXISTS "history"           JSONB;

-- Collection reports read only valid receipts.
CREATE INDEX IF NOT EXISTS "FeePayment_active_paidAt_idx"
  ON "FeePayment" ("instituteId", "paidAt") WHERE "voidedAt" IS NULL;

-- Refresh the Data API schema cache so the mirror sees the new columns.
NOTIFY pgrst, 'reload schema';
