import { CsvValidationError } from "../csv/csv-table-parser";
import {
  ProductCsvParser,
  normalizeCsvDecimal,
  parseCsvBoolean,
} from "./product-csv-parser";

describe("ProductCsvParser", () => {
  const parser = new ProductCsvParser();

  it("maps product columns in any order with ; delimiter", () => {
    const parsed = parser.parse(
      "﻿unitPrice;code;name;isActive\n1200,50;LIC;Licença;sim"
    );
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        data: {
          unitPrice: "1200,50",
          code: "LIC",
          name: "Licença",
          isActive: "sim",
        },
      },
    ]);
  });

  it("requires code, name and unitPrice headers", () => {
    expect(() => parser.parse("code,name\nLIC,Licença")).toThrow(
      "Coluna obrigatória ausente: unitPrice"
    );
  });

  it("rejects unknown columns and more than 500 rows", () => {
    expect(() => parser.parse("code,name,unitPrice,sku\nA,B,1,x")).toThrow(
      CsvValidationError
    );
    const rows = Array.from({ length: 501 }, (_, i) => `C${i},N${i},1`);
    expect(() =>
      parser.parse(`code,name,unitPrice\n${rows.join("\n")}`)
    ).toThrow("O arquivo CSV excede o limite de 500 linhas.");
  });
});

describe("normalizeCsvDecimal", () => {
  it("accepts dot or comma as the decimal separator", () => {
    expect(normalizeCsvDecimal("1200.50")).toBe("1200.50");
    expect(normalizeCsvDecimal(" 1200,5 ")).toBe("1200.5");
    expect(normalizeCsvDecimal("99")).toBe("99");
  });

  it("leaves ambiguous values untouched for schema rejection", () => {
    expect(normalizeCsvDecimal("1.200,50")).toBe("1.200,50");
    expect(normalizeCsvDecimal("1,200,50")).toBe("1,200,50");
  });
});

describe("parseCsvBoolean", () => {
  it.each([
    ["true", true],
    ["SIM", true],
    ["1", true],
    ["false", false],
    ["Não", false],
    ["nao", false],
    ["0", false],
  ])("parses %s", (value, expected) => {
    expect(parseCsvBoolean(value)).toBe(expected);
  });

  it("returns undefined for unknown values", () => {
    expect(parseCsvBoolean("talvez")).toBeUndefined();
  });
});
