import type {
  CompaniesService,
  CompanyAdministrationContext,
} from "../companies/companies.service";
import { CompanyCsvParser } from "./company-csv-parser";
import { CompanyImportService } from "./company-import.service";

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
      return { id: `company-${createCalls.length}` };
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

const context: CompanyAdministrationContext = {
  organizationId: "tenant-a",
  actorUserId: "user-a",
  requestId: "req-a",
  ipAddress: "127.0.0.1",
};

describe("CompanyImportService preview", () => {
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

describe("CompanyImportService confirm", () => {
  it("rejects a fingerprint mismatch before creating companies", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );
    const file = Buffer.from("legalName,document\nEmpresa Alpha,DOC-1");

    await expect(
      service.confirm(file, "0".repeat(64), context)
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
    expect(companies.createCalls).toHaveLength(0);
  });

  it("creates valid companies through CompaniesService", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );
    const file = Buffer.from("legalName,document\nEmpresa Alpha,DOC-1");
    const preview = await service.preview(file, context.organizationId);

    const result = await service.confirm(file, preview.fingerprint, context);

    expect(result).toMatchObject({ processed: 1, imported: 1, rejected: 0 });
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      status: "IMPORTED",
      companyId: "company-1",
      errors: [],
    });
    expect(companies.createCalls).toHaveLength(1);
    expect(companies.createCalls[0]?.[0]).toEqual({
      legalName: "Empresa Alpha",
      document: "DOC-1",
    });
    expect(companies.createCalls[0]?.[1]).toEqual(context);
  });

  it("imports valid rows without rolling back invalid rows", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );
    const file = Buffer.from(
      "legalName,website\nEmpresa Valida,https://valida.example\nEmpresa Invalida,nao-e-url"
    );
    const preview = await service.preview(file, context.organizationId);

    const result = await service.confirm(file, preview.fingerprint, context);

    expect(result).toMatchObject({ processed: 2, imported: 1, rejected: 1 });
    expect(result.rows.map(row => row.status)).toEqual([
      "IMPORTED",
      "REJECTED",
    ]);
    expect(companies.createCalls).toHaveLength(1);
  });

  it("revalidates duplicates at confirmation time", async () => {
    const companies = createCompaniesMock();
    const service = new CompanyImportService(
      new CompanyCsvParser(),
      companies.service
    );
    const file = Buffer.from("legalName,document\nEmpresa Corrida,DOC-2");
    const preview = await service.preview(file, context.organizationId);
    companies.setExistingDocumentsResult(new Set(["doc-2"]));

    const result = await service.confirm(file, preview.fingerprint, context);

    expect(result).toMatchObject({ processed: 1, imported: 0, rejected: 1 });
    expect(result.rows[0]?.errors).toContain(
      "Documento já cadastrado para outra empresa."
    );
    expect(companies.createCalls).toHaveLength(0);
  });
});
