import {
  CsvTableParser,
  type ParsedCsvRow,
  type ParsedCsvTable,
} from "../csv/csv-table-parser";

export const PRODUCT_CSV_HEADERS = [
  "code",
  "name",
  "unitPrice",
  "description",
  "isActive",
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

export type ParsedProductCsvRow = ParsedCsvRow<ProductCsvHeader>;

export type ParsedProductCsv = ParsedCsvTable<ProductCsvHeader>;

export class ProductCsvParser extends CsvTableParser<ProductCsvHeader> {
  constructor() {
    super({
      allowedHeaders: PRODUCT_CSV_HEADERS,
      requiredHeaders: ["code", "name", "unitPrice"],
    });
  }
}

/**
 * Normaliza o preço digitado em planilhas brasileiras ou internacionais:
 * aceita um único separador decimal (`.` ou `,`) e devolve o valor com `.`.
 * Valores com os dois separadores (ex.: `1.200,50`) ou com separador de
 * milhar são devolvidos inalterados para que o schema os rejeite.
 */
export function normalizeCsvDecimal(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes(",") && !trimmed.includes(".")) {
    const parts = trimmed.split(",");
    if (parts.length === 2) {
      return `${parts[0]}.${parts[1]}`;
    }
  }
  return trimmed;
}

const TRUE_VALUES = new Set(["true", "sim", "1"]);
const FALSE_VALUES = new Set(["false", "não", "nao", "0"]);

/** Converte true/false, sim/não e 1/0; `undefined` quando não reconhecido. */
export function parseCsvBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}
