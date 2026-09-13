const COMPANY_CSV_HEADERS = [
  "legalName",
  "tradeName",
  "document",
  "website",
  "notes",
] as const;

type CompanyCsvHeader = (typeof COMPANY_CSV_HEADERS)[number];

export type ParsedCompanyCsvRow = {
  rowNumber: number;
  data: Partial<Record<CompanyCsvHeader, string>>;
};

export type ParsedCompanyCsv = {
  headers: CompanyCsvHeader[];
  rows: ParsedCompanyCsvRow[];
  normalizedContent: string;
};

type LogicalRow = {
  rowNumber: number;
  fields: string[];
};

export class CompanyCsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyCsvValidationError";
  }
}

export class CompanyCsvParser {
  parse(content: Buffer | string): ParsedCompanyCsv {
    const text = (
      Buffer.isBuffer(content) ? content.toString("utf8") : content
    ).replace(/^\uFEFF/, "");
    const delimiter = this.detectDelimiter(text);
    const logicalRows = this.parseRows(text, delimiter);
    const [headerRow, ...dataRows] = logicalRows;

    if (!headerRow) {
      throw new CompanyCsvValidationError("O arquivo CSV está vazio.");
    }

    const headers = this.validateHeaders(headerRow.fields);
    const rows = dataRows
      .filter(row => row.fields.some(field => field.trim().length > 0))
      .map(row => this.mapRow(row, headers));

    if (rows.length > 500) {
      throw new CompanyCsvValidationError(
        "O arquivo CSV excede o limite de 500 linhas."
      );
    }

    return {
      headers,
      rows,
      normalizedContent: JSON.stringify({ headers, rows }),
    };
  }

  private detectDelimiter(text: string): "," | ";" {
    let inQuotes = false;
    let commaCount = 0;
    let semicolonCount = 0;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') {
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && (character === "\n" || character === "\r")) {
        break;
      }

      if (!inQuotes && character === ",") {
        commaCount += 1;
      } else if (!inQuotes && character === ";") {
        semicolonCount += 1;
      }
    }

    return semicolonCount > commaCount ? ";" : ",";
  }

  private parseRows(text: string, delimiter: "," | ";"): LogicalRow[] {
    const rows: LogicalRow[] = [];
    let fields: string[] = [];
    let currentField = "";
    let inQuotes = false;
    let physicalLine = 1;
    let rowStartLine = 1;

    const finishRow = () => {
      fields.push(currentField);
      rows.push({ rowNumber: rowStartLine, fields });
      fields = [];
      currentField = "";
      rowStartLine = physicalLine + 1;
    };

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') {
          currentField += '"';
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && character === delimiter) {
        fields.push(currentField);
        currentField = "";
        continue;
      }

      if (!inQuotes && (character === "\n" || character === "\r")) {
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        finishRow();
        physicalLine += 1;
        continue;
      }

      if (character === "\n") {
        physicalLine += 1;
      }
      currentField += character;
    }

    if (inQuotes) {
      throw new CompanyCsvValidationError(
        "CSV inválido: campo entre aspas não foi encerrado."
      );
    }

    if (currentField.length > 0 || fields.length > 0) {
      fields.push(currentField);
      rows.push({ rowNumber: rowStartLine, fields });
    }

    return rows;
  }

  private validateHeaders(rawHeaders: string[]): CompanyCsvHeader[] {
    const headers = rawHeaders.map(header => header.trim());
    const seen = new Set<string>();

    for (const header of headers) {
      if (!COMPANY_CSV_HEADERS.includes(header as CompanyCsvHeader)) {
        throw new CompanyCsvValidationError(
          `Coluna CSV desconhecida: ${header}`
        );
      }
      if (seen.has(header)) {
        throw new CompanyCsvValidationError(`Coluna CSV duplicada: ${header}`);
      }
      seen.add(header);
    }

    if (!seen.has("legalName")) {
      throw new CompanyCsvValidationError(
        "Coluna obrigatória ausente: legalName"
      );
    }

    return headers as CompanyCsvHeader[];
  }

  private mapRow(
    row: LogicalRow,
    headers: CompanyCsvHeader[]
  ): ParsedCompanyCsvRow {
    if (row.fields.length > headers.length) {
      const extraFields = row.fields.slice(headers.length);
      if (extraFields.some(field => field.trim().length > 0)) {
        throw new CompanyCsvValidationError(
          `Quantidade de colunas inválida na linha ${row.rowNumber}.`
        );
      }
    }

    const data: Partial<Record<CompanyCsvHeader, string>> = {};
    headers.forEach((header, index) => {
      const value = row.fields[index] ?? "";
      if (value.length > 0) {
        data[header] = value;
      }
    });

    return { rowNumber: row.rowNumber, data };
  }
}
