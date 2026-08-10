export interface ImportPreviewRow {
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  phone?: string;
  previousBalance: number;
  assignedFee: number;
  discount: number;
}

export interface ImportSummary {
  error?: string;
  dryRun?: boolean;
  parsed?: number;
  studentsCreated?: number;
  studentsUpdated?: number;
  classesCreated?: string[];
  batchesCreated?: number;
  feeAssignments?: number;
  feesTotal?: number;
  previousTotal?: number;
  discountTotal?: number;
  errors?: string[];
  preview?: ImportPreviewRow[];
}
