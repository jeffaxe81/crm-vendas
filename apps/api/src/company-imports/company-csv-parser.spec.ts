import { CompanyCsvParser } from "./company-csv-parser";

describe("CompanyCsvParser", () => {
  const parser = new CompanyCsvParser();

  it("parses UTF-8 BOM and semicolon-delimited companies", () => {
    const parsed = parser.parse(
      "\uFEFFlegalName;tradeName;document;website;notes\nEmpresa Alpha;Alpha;DOC-1;https://alpha.example;Cliente A"
    );

    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        data: {
          legalName: "Empresa Alpha",
          tradeName: "Alpha",
          document: "DOC-1",
          website: "https://alpha.example",
          notes: "Cliente A",
        },
      },
    ]);
  });

  it("supports quoted delimiters and quoted line breaks", () => {
    const parsed = parser.parse(
      'legalName,tradeName,notes\n"Empresa, Beta","Beta","Linha 1\nLinha 2"'
    );

    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      data: {
        legalName: "Empresa, Beta",
        tradeName: "Beta",
        notes: "Linha 1\nLinha 2",
      },
    });
  });

  it("ignores fully empty data rows", () => {
    const parsed = parser.parse("legalName,document\nEmpresa A,DOC-A\n,,\n\nEmpresa B,DOC-B");
    expect(parsed.rows.map(row => row.data.legalName)).toEqual([
      "Empresa A",
      "Empresa B",
    ]);
  });

  it("rejects an unknown header", () => {
    expect(() => parser.parse("legalName,foo\nEmpresa A,bar")).toThrow(
      "Coluna CSV desconhecida: foo"
    );
  });

  it("rejects files without legalName", () => {
    expect(() => parser.parse("document,tradeName\nDOC-A,Empresa A")).toThrow(
      "Coluna obrigatória ausente: legalName"
    );
  });

  it("accepts 500 non-empty rows", () => {
    const rows = Array.from({ length: 500 }, (_, index) => `Empresa ${index + 1}`).join("\n");
    expect(parser.parse(`legalName\n${rows}`).rows).toHaveLength(500);
  });

  it("rejects 501 non-empty rows", () => {
    const rows = Array.from({ length: 501 }, (_, index) => `Empresa ${index + 1}`).join("\n");
    expect(() => parser.parse(`legalName\n${rows}`)).toThrow(
      "O arquivo CSV excede o limite de 500 linhas."
    );
  });
});
