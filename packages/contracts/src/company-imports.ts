import type { CompanyCreateInput } from "./companies";

export type CompanyImportPreviewRow = {
  rowNumber: number;
  status: "VALID" | "INVALID";
  data: Partial<CompanyCreateInput>;
  errors: string[];
};

export type CompanyImportPreview = {
  fingerprint: string;
  processed: number;
  valid: number;
  invalid: number;
  rows: CompanyImportPreviewRow[];
};

export type CompanyImportResultRow = {
  rowNumber: number;
  status: "IMPORTED" | "REJECTED";
  companyId?: string;
  errors: string[];
};

export type CompanyImportResult = {
  processed: number;
  imported: number;
  rejected: number;
  rows: CompanyImportResultRow[];
};
