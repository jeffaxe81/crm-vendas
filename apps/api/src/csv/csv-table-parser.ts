type LogicalRow = {
  rowNumber: number;
  fields: string[];
};

export class CsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvValidationError";
  }
}

export type CsvTableParserOptions<Header extends string> = {
  allowedHeaders: readonly Header[];
  requiredHeaders: readonly Header[];
  maxRows?: number;
};

export type ParsedCsvRow<Header extends string> = {
  rowNumber: number;
  data: Partial<Record<Header, string>>;
};

export type ParsedCsvTable<Header extends string> = {
  headers: Header[];
  rows: ParsedCsvRow<Header>[];
  normalizedContent: string;
};

/**
 * Parser CSV compartilhado pelas importações (C4.2.x): UTF-8/BOM,
 * delimitador `,` ou `;` autodetectado, campos entre aspas (inclusive com
 * quebras de linha), cabeçalho fixo validado e limite de linhas.
 */
export class CsvTableParser<Header extends string> {
  private readonly maxRows: number;

  constructor(private readonly options: CsvTableParserOptions<Header>) {
    this.maxRows = options.maxRows ?? 500;
  }

  parse(content: Buffer | string): ParsedCsvTable<Header> {
    const text = (
      Buffer.isBuffer(content) ? content.toString("utf8") : content
    ).replace(/^\uFEFF/, "");
    const delimiter = this.detectDelimiter(text);
    const logicalRows = this.parseRows(text, delimiter);
    const [headerRow, ...dataRows] = logicalRows;

    if (!headerRow) {
      throw new CsvValidationError("O arquivo CSV está vazio.");
    }

    const headers = this.validateHeaders(headerRow.fields);
    const rows = dataRows
      .filter(row => row.fields.some(field => field.trim().length > 0))
      .map(row => this.mapRow(row, headers));

    if (rows.length > this.maxRows) {
      throw new CsvValidationError(
        `O arquivo CSV excede o limite de ${this.maxRows} linhas.`
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
      throw new CsvValidationError(
        "CSV inválido: campo entre aspas não foi encerrado."
      );
    }

    if (currentField.length > 0 || fields.length > 0) {
      fields.push(currentField);
      rows.push({ rowNumber: rowStartLine, fields });
    }

    return rows;
  }

  private validateHeaders(rawHeaders: string[]): Header[] {
    const headers = rawHeaders.map(header => header.trim());
    const seen = new Set<string>();

    for (const header of headers) {
      if (!this.options.allowedHeaders.includes(header as Header)) {
        throw new CsvValidationError(`Coluna CSV desconhecida: ${header}`);
      }
      if (seen.has(header)) {
        throw new CsvValidationError(`Coluna CSV duplicada: ${header}`);
      }
      seen.add(header);
    }

    for (const required of this.options.requiredHeaders) {
      if (!seen.has(required)) {
        throw new CsvValidationError(`Coluna obrigatória ausente: ${required}`);
      }
    }

    return headers as Header[];
  }

  private mapRow(row: LogicalRow, headers: Header[]): ParsedCsvRow<Header> {
    if (row.fields.length > headers.length) {
      const extraFields = row.fields.slice(headers.length);
      if (extraFields.some(field => field.trim().length > 0)) {
        throw new CsvValidationError(
          `Quantidade de colunas inválida na linha ${row.rowNumber}.`
        );
      }
    }

    const data: Partial<Record<Header, string>> = {};
    headers.forEach((header, index) => {
      const value = row.fields[index] ?? "";
      if (value.length > 0) {
        data[header] = value;
      }
    });

    return { rowNumber: row.rowNumber, data };
  }
}
