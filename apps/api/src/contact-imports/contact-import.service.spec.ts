import type { ContactChannelInput, ContactCreateInput } from "@axes/contracts";

import type { CompaniesService } from "../companies/companies.service";
import type {
  ContactAdministrationContext,
  ContactsService,
} from "../contacts/contacts.service";
import { CsvValidationError } from "../csv/csv-table-parser";
import { ContactCsvParser } from "./contact-csv-parser";
import { ContactImportService } from "./contact-import.service";

const createContactsMock = (existing: string[] = []) => {
  const existingCalls: Array<{ emails: string[]; organizationId: string }> = [];
  const createCalls: Array<{
    input: ContactCreateInput;
    channels: ContactChannelInput[];
    context: ContactAdministrationContext;
    companyLink?: { companyId: string };
  }> = [];

  const service = {
    existingEmails: async (emails: string[], organizationId: string) => {
      existingCalls.push({ emails, organizationId });
      return new Set(existing);
    },
    createWithChannels: async (
      input: ContactCreateInput,
      channels: ContactChannelInput[],
      context: ContactAdministrationContext,
      companyLink?: { companyId: string }
    ) => {
      createCalls.push({ input, channels, context, companyLink });
      return { contact: { id: `contact-${createCalls.length}` }, channels };
    },
  } as unknown as ContactsService;

  return { service, existingCalls, createCalls };
};

const context: ContactAdministrationContext = {
  organizationId: "tenant-a",
  actorUserId: "user-a",
  requestId: "req-a",
  ipAddress: "127.0.0.1",
};

type CompanyMatch = { id: string; legalName: string };

const createCompaniesMock = (byDocument: Record<string, CompanyMatch[]>) => {
  const calls: string[][] = [];
  const service = {
    findByDocuments: async (documents: string[]) => {
      calls.push(documents);
      return new Map(Object.entries(byDocument));
    },
  } as unknown as CompaniesService;
  return { service, calls };
};

const build = (
  existing: string[] = [],
  byDocument: Record<string, CompanyMatch[]> = {}
) => {
  const contacts = createContactsMock(existing);
  const companies = createCompaniesMock(byDocument);
  return {
    contacts,
    companies,
    service: new ContactImportService(
      new ContactCsvParser(),
      contacts.service,
      companies.service
    ),
  };
};

const canLink = { canLinkCompanies: true };

describe("ContactImportService preview", () => {
  it("validates rows and maps channels without persisting", async () => {
    const { service, contacts } = build();

    const preview = await service.preview(
      Buffer.from(
        "fullName;jobTitle;email;phone;mobile;whatsapp\nAna Souza;Compradora;Ana@Example.test;4833334444;48999990000;48999990000"
      ),
      "tenant-a",
      canLink
    );

    expect(preview).toMatchObject({ processed: 1, valid: 1, invalid: 0 });
    expect(preview.rows[0]?.data).toMatchObject({
      fullName: "Ana Souza",
      email: "Ana@Example.test",
    });
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(contacts.createCalls).toHaveLength(0);
    expect(contacts.existingCalls).toEqual([
      { emails: ["ana@example.test"], organizationId: "tenant-a" },
    ]);
  });

  it("reports row errors for missing name and invalid e-mail", async () => {
    const { service } = build();

    const preview = await service.preview(
      Buffer.from("fullName,email\n,sem-nome@example.test\nBia,nao-e-email"),
      "tenant-a",
      canLink
    );

    expect(preview).toMatchObject({ processed: 2, valid: 0, invalid: 2 });
    expect(preview.rows[0]?.errors.join(" ")).toContain("fullName");
    expect(preview.rows[1]?.errors).toContain(
      "email: formato de e-mail inválido."
    );
  });

  it("flags e-mails duplicated in the file and already registered", async () => {
    const { service } = build(["ja@example.test"]);

    const preview = await service.preview(
      Buffer.from(
        "fullName,email\nAna,ana@example.test\nAna 2,ANA@example.test\nCarla,ja@example.test\nDani,"
      ),
      "tenant-a",
      canLink
    );

    expect(preview.rows.map(row => row.status)).toEqual([
      "VALID",
      "INVALID",
      "INVALID",
      "VALID",
    ]);
    expect(preview.rows[1]?.errors).toContain(
      "E-mail duplicado no arquivo de importação."
    );
    expect(preview.rows[2]?.errors).toContain(
      "E-mail já cadastrado para outro contato."
    );
  });

  it("rejects channel values over the contract limit", async () => {
    const { service } = build();
    const preview = await service.preview(
      Buffer.from(`fullName,phone\nAna,${"9".repeat(321)}`),
      "tenant-a",
      canLink
    );
    expect(preview.rows[0]?.status).toBe("INVALID");
    expect(preview.rows[0]?.errors[0]).toMatch(/^phone: /);
  });

  it("propagates CSV structure errors", async () => {
    const { service } = build();
    await expect(
      service.preview(
        Buffer.from("email\nana@example.test"),
        "tenant-a",
        canLink
      )
    ).rejects.toBeInstanceOf(CsvValidationError);
  });
});

describe("ContactImportService confirm", () => {
  it("creates only valid rows with primary channels", async () => {
    const { service, contacts } = build();
    const csv = Buffer.from(
      "fullName,email,whatsapp\nAna,ana@example.test,48999990000\n,sem-nome@example.test"
    );
    const preview = await service.preview(csv, context.organizationId, canLink);

    const result = await service.confirm(
      csv,
      preview.fingerprint,
      context,
      canLink
    );

    expect(result).toMatchObject({ processed: 2, imported: 1, rejected: 1 });
    expect(result.rows[0]).toMatchObject({
      status: "IMPORTED",
      contactId: "contact-1",
    });
    expect(result.rows[1]?.status).toBe("REJECTED");
    expect(contacts.createCalls).toHaveLength(1);
    expect(contacts.createCalls[0]?.input).toEqual({ fullName: "Ana" });
    expect(contacts.createCalls[0]?.channels).toEqual([
      { type: "EMAIL", value: "ana@example.test", isPrimary: true },
      { type: "WHATSAPP", value: "48999990000", isPrimary: true },
    ]);
    expect(contacts.createCalls[0]?.context).toBe(context);
  });

  it("refuses a fingerprint that does not match the file", async () => {
    const { service, contacts } = build();
    await expect(
      service.confirm(
        Buffer.from("fullName\nAna"),
        "0".repeat(64),
        context,
        canLink
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(contacts.createCalls).toHaveLength(0);
  });
});

describe("ContactImportService company link (C4.2.3)", () => {
  const acme = { id: "company-acme", legalName: "Acme Ltda" };

  it("resolves companyDocument to a single company and links on confirm", async () => {
    const { service, contacts, companies } = build([], {
      "doc-acme": [acme],
    });
    const csv = Buffer.from("fullName,companyDocument\nAna, DOC-ACME \nBia,");

    const preview = await service.preview(csv, "tenant-a", canLink);
    expect(companies.calls).toEqual([["DOC-ACME"]]);
    expect(preview.rows[0]).toMatchObject({ status: "VALID", company: acme });
    expect(preview.rows[1]?.company).toBeUndefined();

    const result = await service.confirm(
      csv,
      preview.fingerprint,
      context,
      canLink
    );
    expect(result.rows[0]).toMatchObject({
      status: "IMPORTED",
      companyId: "company-acme",
    });
    expect(result.rows[1]?.companyId).toBeUndefined();
    expect(contacts.createCalls.map(call => call.companyLink)).toEqual([
      { companyId: "company-acme" },
      undefined,
    ]);
  });

  it("rejects unknown and ambiguous documents", async () => {
    const { service } = build([], {
      "doc-dup": [acme, { id: "company-2", legalName: "Acme Filial" }],
    });

    const preview = await service.preview(
      Buffer.from("fullName,companyDocument\nAna,DOC-X\nBia,DOC-DUP"),
      "tenant-a",
      canLink
    );

    expect(preview.rows[0]?.errors).toContain(
      "Nenhuma empresa cadastrada com o documento informado."
    );
    expect(preview.rows[1]?.errors).toContain(
      "O documento informado corresponde a mais de uma empresa."
    );
  });

  it("requires company.write to link and skips the lookup otherwise", async () => {
    const { service, companies } = build([], { "doc-acme": [acme] });

    const preview = await service.preview(
      Buffer.from("fullName,companyDocument\nAna,DOC-ACME\nBia,"),
      "tenant-a",
      { canLinkCompanies: false }
    );

    expect(companies.calls).toHaveLength(0);
    expect(preview.rows[0]?.errors).toContain(
      "Sem permissão para vincular contatos a empresas (company.write)."
    );
    expect(preview.rows[1]?.status).toBe("VALID");
  });
});
