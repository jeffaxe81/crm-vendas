import type { SalesByOwnerReport } from "./sales-by-owner";
import type {
  SalesByProductBucket,
  SalesByProductReport,
} from "./sales-by-product";

/**
 * CSV no padrão do Excel pt-BR: separador ";", decimal com vírgula,
 * quebra de linha CRLF e BOM UTF-8 para acentuação correta.
 */
export const REPORT_CSV_BOM = "\uFEFF";
const SEPARATOR = ";";

/** Neutraliza fórmulas (CSV injection) e escapa aspas e separadores. */
export function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(,\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  if (/[";\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** "1234.50" → "1234,50" (sem separador de milhar, para somar no Excel). */
export function csvDecimal(value: string): string {
  return value.replace(".", ",");
}

function toCsv(header: string[], rows: Array<Array<string | number | null>>) {
  const lines = [header, ...rows].map(row =>
    row.map(cell => csvCell(cell)).join(SEPARATOR)
  );
  return `${REPORT_CSV_BOM}${lines.join("\r\n")}\r\n`;
}

const PRODUCT_BUCKETS = [
  ["open", "Em aberto"],
  ["won", "Ganho"],
  ["lost", "Perdido"],
  ["total", "Total"],
] as const;

function productBucketCells(bucket: SalesByProductBucket) {
  return [
    csvDecimal(bucket.value),
    csvDecimal(bucket.quantity),
    bucket.opportunities,
  ];
}

export function salesByProductToCsv(report: SalesByProductReport): string {
  const header = [
    "Código",
    "Produto",
    "Situação do produto",
    ...PRODUCT_BUCKETS.flatMap(([, label]) => [
      `${label} - valor`,
      `${label} - quantidade`,
      `${label} - oportunidades`,
    ]),
  ];
  const rows = report.items.map(item => [
    item.productCode,
    item.productName,
    item.productDeleted ? "Excluído" : item.productActive ? "Ativo" : "Inativo",
    ...PRODUCT_BUCKETS.flatMap(([key]) => productBucketCells(item[key])),
  ]);
  rows.push([
    "",
    "Total geral",
    "",
    ...PRODUCT_BUCKETS.flatMap(([key]) =>
      productBucketCells(report.totals[key])
    ),
  ]);
  return toCsv(header, rows);
}

export function salesByOwnerToCsv(report: SalesByOwnerReport): string {
  const header = [
    "Vendedor",
    "Situação do vendedor",
    ...PRODUCT_BUCKETS.flatMap(([, label]) => [
      `${label} - valor`,
      `${label} - oportunidades`,
    ]),
    "Taxa de conversão (%)",
  ];
  const cells = (row: SalesByOwnerReport["totals"]) => [
    ...PRODUCT_BUCKETS.flatMap(([key]) => [
      csvDecimal(row[key].value),
      row[key].opportunities,
    ]),
    row.winRate === null ? null : csvDecimal(row.winRate),
  ];
  const rows = report.items.map(item => [
    item.ownerName,
    item.ownerActive ? "Ativo" : "Inativo",
    ...cells(item),
  ]);
  rows.push(["Total geral", "", ...cells(report.totals)]);
  return toCsv(header, rows);
}
