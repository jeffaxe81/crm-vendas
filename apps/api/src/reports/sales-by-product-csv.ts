import type {
  SalesByProductBucket,
  SalesByProductReport,
  SalesByProductRow,
} from "@axes/contracts";

/** BOM UTF-8: faz o Excel reconhecer a codificação e os acentos. */
export const CSV_BOM = "﻿";
/** Separador padrão do Excel em pt-BR (a vírgula é o separador decimal). */
export const CSV_SEPARATOR = ";";
const CSV_LINE_BREAK = "\r\n";

/** Caracteres que fazem planilhas interpretarem a célula como fórmula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

const BUCKETS = [
  ["open", "Em aberto"],
  ["won", "Ganho"],
  ["lost", "Perdido"],
  ["total", "Total"],
] as const;

export const SALES_BY_PRODUCT_CSV_HEADER: readonly string[] = [
  "Código",
  "Produto",
  "Situação do produto",
  ...BUCKETS.flatMap(([, label]) => [
    `${label} - quantidade`,
    `${label} - oportunidades`,
    `${label} - valor (R$)`,
  ]),
];

/**
 * Neutraliza injeção de fórmula (CSV injection): texto que começa com
 * `=`, `+`, `-`, `@`, tabulação ou retorno de carro recebe aspa simples.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_PREFIXES.some(prefix => value.startsWith(prefix))
    ? `'${value}`
    : value;
}

/** Aplica as aspas do RFC 4180 quando o campo contém separador, aspas ou quebra. */
export function quoteCsvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Célula de texto livre (vinda do usuário): neutraliza fórmula e aplica aspas. */
export function csvTextCell(value: string): string {
  return quoteCsvField(neutralizeFormula(value));
}

/** Converte decimal serializado ("1234.50") para o padrão pt-BR ("1234,50"). */
export function csvDecimal(value: string): string {
  return value.replace(".", ",");
}

function bucketCells(bucket: SalesByProductBucket): string[] {
  return [
    csvDecimal(bucket.quantity),
    String(bucket.opportunities),
    csvDecimal(bucket.value),
  ];
}

function productStatus(row: SalesByProductRow): string {
  if (row.productDeleted) {
    return "Excluído";
  }
  return row.productActive ? "Ativo" : "Inativo";
}

function csvLine(cells: string[]): string {
  return cells.join(CSV_SEPARATOR);
}

/**
 * Formata o relatório de vendas por produto como CSV para Excel pt-BR:
 * BOM UTF-8, separador `;`, vírgula decimal, CRLF e linha "Total geral".
 */
export function formatSalesByProductCsv(report: SalesByProductReport): string {
  const lines = [csvLine(SALES_BY_PRODUCT_CSV_HEADER.map(csvTextCell))];

  for (const row of report.items) {
    lines.push(
      csvLine([
        csvTextCell(row.productCode),
        csvTextCell(row.productName),
        productStatus(row),
        ...BUCKETS.flatMap(([key]) => bucketCells(row[key])),
      ])
    );
  }

  lines.push(
    csvLine([
      "",
      "Total geral",
      "",
      ...BUCKETS.flatMap(([key]) => bucketCells(report.totals[key])),
    ])
  );

  return `${CSV_BOM}${lines.join(CSV_LINE_BREAK)}${CSV_LINE_BREAK}`;
}

/** Nome do arquivo com a data de referência no fuso de Brasília. */
export function salesByProductCsvFilename(asOf: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(asOf));
  return `vendas-por-produto-${date}.csv`;
}
