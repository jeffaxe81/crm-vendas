import type { SalesByProductReport } from "@axes/contracts";

import {
  CSV_BOM,
  csvDecimal,
  csvTextCell,
  formatSalesByProductCsv,
  neutralizeFormula,
  quoteCsvField,
  SALES_BY_PRODUCT_CSV_HEADER,
  salesByProductCsvFilename,
} from "./sales-by-product-csv";

const bucket = (quantity: string, opportunities: number, value: string) => ({
  quantity,
  opportunities,
  value,
});
const empty = bucket("0.000", 0, "0.00");

function reportWith(
  items: SalesByProductReport["items"],
  totals = { open: empty, won: empty, lost: empty, total: empty }
): SalesByProductReport {
  return {
    asOf: "2026-09-25T12:00:00.000Z",
    filters: { from: null, to: null, pipelineId: null, ownerUserId: null },
    items,
    totals,
  };
}

function row(
  code: string,
  name: string,
  overrides: Partial<SalesByProductReport["items"][number]> = {}
): SalesByProductReport["items"][number] {
  return {
    productId: "11111111-1111-4111-8111-111111111111",
    productCode: code,
    productName: name,
    productActive: true,
    productDeleted: false,
    open: empty,
    won: empty,
    lost: empty,
    total: empty,
    ...overrides,
  };
}

function lines(csv: string): string[] {
  expect(csv.startsWith(CSV_BOM)).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(CSV_BOM.length, -2).split("\r\n");
}

describe("C4.4.1 sales by product CSV formatter", () => {
  it("writes a Portuguese header, pt-BR decimals and the grand total row", () => {
    const csv = formatSalesByProductCsv(
      reportWith(
        [
          row("LIC", "Licença PABX", {
            open: bucket("4.000", 1, "2800.00"),
            won: bucket("3.500", 2, "90000000000000000.30"),
            total: bucket("7.500", 3, "90000000000000002800.30"),
          }),
          row("SUP", "Suporte", { productActive: false }),
          row("OLD", "Antigo", { productActive: false, productDeleted: true }),
        ],
        {
          open: bucket("4.000", 1, "2800.00"),
          won: bucket("3.500", 2, "90000000000000000.30"),
          lost: empty,
          total: bucket("7.500", 3, "90000000000000002800.30"),
        }
      )
    );

    const [header, first, second, third, total, ...rest] = lines(csv);
    expect(rest).toEqual([]);
    expect(header).toBe(SALES_BY_PRODUCT_CSV_HEADER.join(";"));
    expect(header).toContain(
      "Em aberto - quantidade;Em aberto - oportunidades"
    );
    expect(first).toBe(
      "LIC;Licença PABX;Ativo;4,000;1;2800,00;3,500;2;90000000000000000,30;0,000;0;0,00;7,500;3;90000000000000002800,30"
    );
    expect(second).toMatch(/^SUP;Suporte;Inativo;/);
    expect(third).toMatch(/^OLD;Antigo;Excluído;/);
    expect(total).toBe(
      ";Total geral;;4,000;1;2800,00;3,500;2;90000000000000000,30;0,000;0;0,00;7,500;3;90000000000000002800,30"
    );
  });

  it("writes only header and zeroed total for an empty report", () => {
    const [header, total, ...rest] = lines(
      formatSalesByProductCsv(reportWith([]))
    );
    expect(header?.split(";")).toHaveLength(15);
    expect(total).toBe(
      ";Total geral;;0,000;0;0,00;0,000;0;0,00;0,000;0;0,00;0,000;0;0,00"
    );
    expect(rest).toEqual([]);
  });

  it("neutralizes formula injection in product fields", () => {
    for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(neutralizeFormula(`${prefix}1+1`)).toBe(`'${prefix}1+1`);
    }
    expect(neutralizeFormula("Licença =1")).toBe("Licença =1");

    const [, first] = lines(
      formatSalesByProductCsv(
        reportWith([row('=HYPERLINK("http://x")', "@SUM(A1)")])
      )
    );
    expect(first).toMatch(
      /^"'=HYPERLINK\(""http:\/\/x""\)";'@SUM\(A1\);Ativo;/
    );
  });

  it("quotes separators, quotes and line breaks (RFC 4180)", () => {
    expect(quoteCsvField("a;b")).toBe('"a;b"');
    expect(quoteCsvField('diz "oi"')).toBe('"diz ""oi"""');
    expect(quoteCsvField("linha\n2")).toBe('"linha\n2"');
    expect(quoteCsvField("simples, com vírgula")).toBe("simples, com vírgula");
    expect(csvTextCell("-5;x")).toBe('"\'-5;x"');
  });

  it("converts decimals and names the file with the Brasília date", () => {
    expect(csvDecimal("1234.50")).toBe("1234,50");
    expect(csvDecimal("0.000")).toBe("0,000");
    expect(salesByProductCsvFilename("2026-09-25T12:00:00.000Z")).toBe(
      "vendas-por-produto-2026-09-25.csv"
    );
    // 01:00 UTC ainda é o dia anterior em Brasília (UTC-3).
    expect(salesByProductCsvFilename("2026-09-26T01:00:00.000Z")).toBe(
      "vendas-por-produto-2026-09-25.csv"
    );
  });
});
