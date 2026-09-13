import type { CompaniesService } from "../companies/companies.service";
import { CompanyCsvParser } from "./company-csv-parser";
import { CompanyImportService } from "./company-import.service";

describe("CompanyImportService preview", () => {
  const createCompaniesMock = () => {
    let existingDocumentsResult = new Set<string>();
    const existingDocumentsCalls: Array<{
      documents: string[];
      organizationId: string;
    }> = [];
    const createCalls: unknown[][] = [];

    const service = {
      existingDocuments: async (documents: string[], organizationId: string) => {
        existingDocumentsCalls.push({ documents, organizationId });
        return existingDocumentsResult;
      },
      create: async (...args: unknown[]) => {
        createCalls.push(args);
        return { id: "unused" };
      },
    } as unknown as CompaniesService;

    return {
      service,
      existingDocumentsCalls,
      createCalls,
      setExistingDocumentsResult: (documents: Set<string>) => {
        existingDocumentsResult = documents;
      },
    };
  };

  it("validates rows without persisting companies", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );

    const preview = await service.preview(
      Buffer.from(
        "legalName,document,website\nEmpresa Alpha,DOC-1,https://alpha.example"
      ),
      "tenant-a"
    );

    expect(preview.processed).toBe(1);
    expect(preview.valid).toBe(1);
    expect(preview.invalid).toBe(0);
    expect(preview.rows[0]?.status).toBe("VALID");
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(companies.createCalls).toHaveLength(0);
    expect(companies.existingDocumentsCalls).toEqual([
      { documents: ["doc-1"], organizationId: "tenant-a" },
    ]);
  });

  it("marks schema-invalid rows as invalid", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );

    const preview = await service.preview(
      Buffer.from("legalName,website\nEmpresa Beta,nao-e-url"),
      "tenant-a"
    );

    expect(preview.valid).toBe(0);
    expect(preview.invalid).toBe(1);
    expect(preview.rows[0]?.status).toBe("INVALID");
    expect(preview.rows[0]?.errors.length).toBeGreaterThan(0);
    expect(companies.createCalls).toHaveLength(0);
  });

  it("rejects a repeated document inside the same file", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );

    const preview = await service.preview(
      Buffer.from(
        "legalName,document\nEmpresa Um,DOC-1\nEmpresa Dois, doc-1 "
      ),
      "tenant-a"
    );

    expect(preview.rows.map(row => row.status)).toEqual(["VALID", "INVALID"]);
    expect(preview.rows[1]?.errors).toContain(
      "Documento duplicado no arquivo de importação."
    );
  });

  it("rejects documents that already exist in the current tenant", async () => {
    const companies = createCompaniesMock();
    companies.setExistingDocumentsResult(new Set(["doc-9"]));
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );

    const preview = await service.preview(
      Buffer.from("legalName,document\nEmpresa Nove,DOC-9"),
      "tenant-a"
    );

    expect(preview.rows[0]?.status).toBe("INVALID");
    expect(preview.rows[0]?.errors).toContain(
      "Documento já cadastrado para outra empresa."
    );
    expect(companies.existingDocumentsCalls).toEqual([
      { documents: ["doc-9"], organizationId: "tenant-a" },
    ]);
  });
});
