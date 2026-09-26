import type { ProductCreateInput } from "./products";

/** Valores brutos (após trim) lidos de uma linha do CSV de produtos. */
export type ProductImportRowData = Partial<{
  code: string;
  name: string;
  unitPrice: string;
  description: string;
  isActive: string;
}>;

export type ProductImportPreviewRow = {
  rowNumber: number;
  status: "VALID" | "INVALID";
  data: ProductImportRowData;
  /** Produto normalizado que será criado (somente em linhas válidas). */
  product?: ProductCreateInput;
  errors: string[];
};

export type ProductImportPreview = {
  fingerprint: string;
  processed: number;
  valid: number;
  invalid: number;
  rows: ProductImportPreviewRow[];
};

export type ProductImportResultRow = {
  rowNumber: number;
  status: "IMPORTED" | "REJECTED";
  productId?: string;
  errors: string[];
};

export type ProductImportResult = {
  processed: number;
  imported: number;
  rejected: number;
  rows: ProductImportResultRow[];
};
