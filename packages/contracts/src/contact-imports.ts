import type { ContactCreateInput } from "./contacts";

export type ContactImportRowData = Partial<
  ContactCreateInput & {
    email: string;
    phone: string;
    mobile: string;
    whatsapp: string;
  }
>;

export type ContactImportPreviewRow = {
  rowNumber: number;
  status: "VALID" | "INVALID";
  data: ContactImportRowData;
  errors: string[];
};

export type ContactImportPreview = {
  fingerprint: string;
  processed: number;
  valid: number;
  invalid: number;
  rows: ContactImportPreviewRow[];
};

export type ContactImportResultRow = {
  rowNumber: number;
  status: "IMPORTED" | "REJECTED";
  contactId?: string;
  errors: string[];
};

export type ContactImportResult = {
  processed: number;
  imported: number;
  rejected: number;
  rows: ContactImportResultRow[];
};
