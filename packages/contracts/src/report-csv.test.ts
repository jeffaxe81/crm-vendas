import { describe, expect, it } from "vitest";

import {
  REPORT_CSV_BOM,
  csvCell,
  salesByOwnerToCsv,
  salesByProductToCsv,
} from "./report-csv";

describe("csvCell", () => {
  it("escapes separators, quotes and line breaks", () => {
    expect(csvCell('Licença "Pro"; anual')).toBe('"Licença ""Pro""; anual"');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });

  it("neutralizes spreadsheet formulas but keeps plain numbers", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+55 41")).toBe("'+55 41");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12,50")).toBe("-12,50");
  });
});

describe("salesByProductToCsv", () => {
  const bucket = { quantity: "2.500", opportunities: 1, value: "1500.00" };
  const empty = { quantity: "0.000", opportunities: 0, value: "0.00" };

  it("writes BOM, header, one line per product and the grand total", () => {
    const csv = salesByProductToCsv({
      asOf: "2026-09-25T12:00:00.000Z",
      filters: { from: null, to: null, pipelineId: null, ownerUserId: null },
      items: [
        {
          productId: "22222222-2222-4222-8222-222222222222",
          productCode: "LIC",
          productName: "Licença; PABX",
          productActive: false,
          productDeleted: false,
          open: empty,
          won: bucket,
          lost: empty,
          total: bucket,
        },
      ],
      totals: { open: empty, won: bucket, lost: empty, total: bucket },
    });

    expect(csv.startsWith(REPORT_CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "Código;Produto;Situação do produto;Em aberto - valor;Em aberto - quantidade;Em aberto - oportunidades;Ganho - valor;Ganho - quantidade;Ganho - oportunidades;Perdido - valor;Perdido - quantidade;Perdido - oportunidades;Total - valor;Total - quantidade;Total - oportunidades"
    );
    expect(lines[1]).toBe(
      'LIC;"Licença; PABX";Inativo;0,00;0,000;0;1500,00;2,500;1;0,00;0,000;0;1500,00;2,500;1'
    );
    expect(lines[2]).toBe(
      ";Total geral;;0,00;0,000;0;1500,00;2,500;1;0,00;0,000;0;1500,00;2,500;1"
    );
    expect(lines[3]).toBe("");
  });
});

describe("salesByOwnerToCsv", () => {
  it("writes owners, win rate and an empty cell when there is no closing", () => {
    const won = { opportunities: 2, value: "3000.00" };
    const open = { opportunities: 1, value: "999.90" };
    const empty = { opportunities: 0, value: "0.00" };
    const csv = salesByOwnerToCsv({
      asOf: "2026-09-25T12:00:00.000Z",
      filters: { from: null, to: null, pipelineId: null },
      items: [
        {
          ownerUserId: "11111111-1111-4111-8111-111111111111",
          ownerName: "Ana",
          ownerActive: true,
          open: empty,
          won,
          lost: empty,
          total: won,
          winRate: "100.0",
        },
        {
          ownerUserId: "33333333-3333-4333-8333-333333333333",
          ownerName: "=Bruno",
          ownerActive: false,
          open,
          won: empty,
          lost: empty,
          total: open,
          winRate: null,
        },
      ],
      totals: {
        open,
        won,
        lost: empty,
        total: { opportunities: 3, value: "3999.90" },
        winRate: "100.0",
      },
    });

    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "Vendedor;Situação do vendedor;Em aberto - valor;Em aberto - oportunidades;Ganho - valor;Ganho - oportunidades;Perdido - valor;Perdido - oportunidades;Total - valor;Total - oportunidades;Taxa de conversão (%)"
    );
    expect(lines[1]).toBe("Ana;Ativo;0,00;0;3000,00;2;0,00;0;3000,00;2;100,0");
    expect(lines[2]).toBe("'=Bruno;Inativo;999,90;1;0,00;0;0,00;0;999,90;1;");
    expect(lines[3]).toBe(
      "Total geral;;999,90;1;3000,00;2;0,00;0;3999,90;3;100,0"
    );
  });
});
