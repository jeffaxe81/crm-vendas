import {
  CsvTableParser,
  type ParsedCsvRow,
  type ParsedCsvTable,
} from "../csv/csv-table-parser";

export const CONTACT_CSV_HEADERS = [
  "fullName",
  "jobTitle",
  "email",
  "phone",
  "mobile",
  "whatsapp",
  "notes",
  "companyDocument",
] as const;

export type ContactCsvHeader = (typeof CONTACT_CSV_HEADERS)[number];

export type ParsedContactCsvRow = ParsedCsvRow<ContactCsvHeader>;

export type ParsedContactCsv = ParsedCsvTable<ContactCsvHeader>;

export class ContactCsvParser extends CsvTableParser<ContactCsvHeader> {
  constructor() {
    super({
      allowedHeaders: CONTACT_CSV_HEADERS,
      requiredHeaders: ["fullName"],
    });
  }
}
