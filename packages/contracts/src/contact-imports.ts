import type { ContactCreateInput } from "./contacts";

export type ContactImportRowData = Partial<
  ContactCreateInput & {
    email: string;
    phone: string;
    mobile: string;
    whatsapp: string;
    /** Documento de uma empresa já cadastrada, para vincular o contato. */
    companyDocument: string;
  }
>;

export type ContactImportCompanyMatch = {
  id: string;
  legalName: string;
};

export type ContactImportPreviewRow = {
  rowNumber: number;
  status: "VALID" | "INVALID";
  data: ContactImportRowData;
  /** Empresa encontrada pelo `companyDocument`, quando informado. */
  company?: ContactImportCompanyMatch;
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
  companyId?: string;
  errors: string[];
};

export type ContactImportResult = {
  processed: number;
  imported: number;
  rejected: number;
  rows: ContactImportResultRow[];
};
