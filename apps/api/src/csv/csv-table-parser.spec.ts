import { CsvTableParser, CsvValidationError } from "./csv-table-parser";

describe("CsvTableParser", () => {
  const parser = new CsvTableParser({
    allowedHeaders: ["name", "email", "notes"] as const,
    requiredHeaders: ["name"] as const,
    maxRows: 3,
  });

  it("maps rows by header and tracks physical line numbers", () => {
    const parsed = parser.parse('name,notes\n"Ana","linha 1\nlinha 2"\nBia,');
    expect(parsed.headers).toEqual(["name", "notes"]);
    expect(parsed.rows).toEqual([
      { rowNumber: 2, data: { name: "Ana", notes: "linha 1\nlinha 2" } },
      { rowNumber: 4, data: { name: "Bia" } },
    ]);
  });

  it("accepts CRLF line endings", () => {
    const parsed = parser.parse("name;email\r\nAna;ana@example.test\r\n");
    expect(parsed.rows).toEqual([
      { rowNumber: 2, data: { name: "Ana", email: "ana@example.test" } },
    ]);
  });

  it("throws CsvValidationError for missing required headers", () => {
    expect(() => parser.parse("email\nana@example.test")).toThrow(
      CsvValidationError
    );
    expect(() => parser.parse("email\nana@example.test")).toThrow(
      "Coluna obrigatória ausente: name"
    );
  });

  it("rejects duplicated headers", () => {
    expect(() => parser.parse("name,name\nAna,Ana")).toThrow(
      "Coluna CSV duplicada: name"
    );
  });

  it("rejects extra non-empty columns in a row", () => {
    expect(() => parser.parse("name\nAna,extra")).toThrow(
      "Quantidade de colunas inválida na linha 2."
    );
  });

  it("rejects unterminated quotes", () => {
    expect(() => parser.parse('name\n"Ana')).toThrow(
      "CSV inválido: campo entre aspas não foi encerrado."
    );
  });

  it("rejects empty files", () => {
    expect(() => parser.parse("")).toThrow("O arquivo CSV está vazio.");
  });

  it("applies the configured row limit", () => {
    expect(() => parser.parse("name\nA\nB\nC\nD")).toThrow(
      "O arquivo CSV excede o limite de 3 linhas."
    );
  });
});
