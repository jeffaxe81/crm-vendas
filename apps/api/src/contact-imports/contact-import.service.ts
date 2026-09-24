import {
  ContactChannelInputSchema,
  ContactCreateInputSchema,
  type ContactChannelInput,
  type ContactChannelType,
  type ContactCreateInput,
  type ContactImportPreview,
  type ContactImportPreviewRow,
  type ContactImportResult,
  type ContactImportRowData,
} from "@axes/contracts";
import { createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  ContactsService,
  type ContactAdministrationContext,
} from "../contacts/contacts.service";
import {
  ContactCsvParser,
  type ParsedContactCsvRow,
} from "./contact-csv-parser";

const CHANNEL_COLUMNS: ReadonlyArray<{
  column: "email" | "phone" | "mobile" | "whatsapp";
  type: ContactChannelType;
}> = [
  { column: "email", type: "EMAIL" },
  { column: "phone", type: "PHONE" },
  { column: "mobile", type: "MOBILE" },
  { column: "whatsapp", type: "WHATSAPP" },
];

const EmailSchema = z.email();

type ValidatedRow = {
  rowNumber: number;
  data: ContactImportRowData;
  contact?: ContactCreateInput;
  channels: ContactChannelInput[];
  errors: string[];
};

@Injectable()
export class ContactImportService {
  constructor(
    @Inject(ContactCsvParser) private readonly parser: ContactCsvParser,
    @Inject(ContactsService) private readonly contacts: ContactsService
  ) {}

  async preview(
    file: Buffer,
    organizationId: string
  ): Promise<ContactImportPreview> {
    const { rows, fingerprint } = await this.validate(file, organizationId);
    const previewRows: ContactImportPreviewRow[] = rows.map(row => ({
      rowNumber: row.rowNumber,
      status: row.errors.length === 0 ? "VALID" : "INVALID",
      data: row.data,
      errors: row.errors,
    }));
    const valid = previewRows.filter(row => row.status === "VALID").length;

    return {
      fingerprint,
      processed: previewRows.length,
      valid,
      invalid: previewRows.length - valid,
      rows: previewRows,
    };
  }

  async confirm(
    file: Buffer,
    fingerprint: string,
    context: ContactAdministrationContext
  ): Promise<ContactImportResult> {
    const validated = await this.validate(file, context.organizationId);

    if (validated.fingerprint !== fingerprint) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message:
          "O arquivo foi alterado após o preview. Gere um novo preview antes de confirmar.",
      });
    }

    const rows: ContactImportResult["rows"] = [];

    for (const row of validated.rows) {
      if (row.errors.length > 0 || !row.contact) {
        rows.push({
          rowNumber: row.rowNumber,
          status: "REJECTED",
          errors: row.errors,
        });
        continue;
      }

      const { contact } = await this.contacts.createWithChannels(
        row.contact,
        row.channels,
        context
      );
      rows.push({
        rowNumber: row.rowNumber,
        status: "IMPORTED",
        contactId: contact.id,
        errors: [],
      });
    }

    const imported = rows.filter(row => row.status === "IMPORTED").length;

    return {
      processed: rows.length,
      imported,
      rejected: rows.length - imported,
      rows,
    };
  }

  private async validate(file: Buffer, organizationId: string) {
    const parsed = this.parser.parse(file);
    const rows = parsed.rows.map(row => this.validateRow(row));

    const emails = rows
      .map(row => this.emailOf(row))
      .filter((email): email is string => Boolean(email));
    const existing = await this.contacts.existingEmails(emails, organizationId);
    const seen = new Set<string>();

    for (const row of rows) {
      const email = this.emailOf(row);
      if (!email) continue;

      if (seen.has(email)) {
        row.errors.push("E-mail duplicado no arquivo de importação.");
      } else if (existing.has(email)) {
        row.errors.push("E-mail já cadastrado para outro contato.");
      }
      seen.add(email);
    }

    return {
      rows,
      fingerprint: createHash("sha256")
        .update(parsed.normalizedContent)
        .digest("hex"),
    };
  }

  private validateRow(row: ParsedContactCsvRow): ValidatedRow {
    const data = Object.fromEntries(
      Object.entries(row.data)
        .map(([key, value]) => [key, value?.trim()])
        .filter(([, value]) => value !== undefined && value !== "")
    ) as ContactImportRowData;

    const errors: string[] = [];
    const contactResult = ContactCreateInputSchema.safeParse({
      fullName: data.fullName,
      jobTitle: data.jobTitle,
      notes: data.notes,
    });

    if (!contactResult.success) {
      errors.push(
        ...contactResult.error.issues.map(issue =>
          this.describeIssue(issue.path, issue.message)
        )
      );
    }

    const channels: ContactChannelInput[] = [];
    for (const { column, type } of CHANNEL_COLUMNS) {
      const value = data[column];
      if (!value) continue;

      if (column === "email" && !EmailSchema.safeParse(value).success) {
        errors.push("email: formato de e-mail inválido.");
        continue;
      }

      const channel = ContactChannelInputSchema.safeParse({
        type,
        value: column === "email" ? value.toLocaleLowerCase("pt-BR") : value,
        isPrimary: true,
      });
      if (channel.success) {
        channels.push(channel.data);
      } else {
        errors.push(
          ...channel.error.issues.map(issue => `${column}: ${issue.message}`)
        );
      }
    }

    return {
      rowNumber: row.rowNumber,
      data,
      contact: contactResult.success ? contactResult.data : undefined,
      channels,
      errors,
    };
  }

  private emailOf(row: ValidatedRow): string | undefined {
    return row.channels
      .find(channel => channel.type === "EMAIL")
      ?.value.toLocaleLowerCase("pt-BR");
  }

  private describeIssue(path: PropertyKey[], message: string): string {
    const field = path.map(String).join(".");
    return field ? `${field}: ${message}` : message;
  }
}
