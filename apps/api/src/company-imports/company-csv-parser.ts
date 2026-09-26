import {
  CsvTableParser,
  type ParsedCsvRow,
  type ParsedCsvTable,
} from "../csv/csv-table-parser";

const COMPANY_CSV_HEADERS = [
  "legalName",
  "tradeName",
  "document",
  "website",
  "notes",
] as const;

type CompanyCsvHeader = (typeof COMPANY_CSV_HEADERS)[number];

export type ParsedCompanyCsvRow = ParsedCsvRow<CompanyCsvHeader>;

export type ParsedCompanyCsv = ParsedCsvTable<CompanyCsvHeader>;

export class CompanyCsvParser extends CsvTableParser<CompanyCsvHeader> {
  constructor() {
    super({
      allowedHeaders: COMPANY_CSV_HEADERS,
      requiredHeaders: ["legalName"],
    });
  }
}
