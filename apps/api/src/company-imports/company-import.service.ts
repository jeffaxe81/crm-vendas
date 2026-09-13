import {
  CompanyCreateInputSchema,
  type CompanyCreateInput,
  type CompanyImportPreview,
  type CompanyImportResult,
} from "@axes/contracts";
import { createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  CompaniesService,
  type CompanyAdministrationContext,
} from "../companies/companies.service";
import { CompanyCsvParser } from "./company-csv-parser";

type ValidatedRow = {
  rowNumber: number;
  data?: CompanyCreateInput;
  errors: string[];
};

@Injectable()
export class CompanyImportService {
  constructor(
    @Inject(CompanyCsvParser) private readonly parser: CompanyCsvParser,
    @Inject(CompaniesService) private readonly companies: CompaniesService
  ) {}

  async preview(
    file: Buffer,
    organizationId: string
  ): Promise<CompanyImportPreview> {
    const parsedCsv = this.parser.parse(file);
    const validatedRows = parsedCsv.rows.map(row => this.validateRow(row));
    const documents = Array.from(
      new Set(
        validatedRows
          .map(row => row.data?.document)
          .filter((document): document is string => Boolean(document))
          .map(document => this.normalizeDocument(document))
      )
    );
    const existingDocuments = await this.companies.existingDocuments(
      documents,
      organizationId
    );
    const seenDocuments = new Set<string>();

    const rows = validatedRows.map(row => {
      if (!row.data) {
        return {
          rowNumber: row.rowNumber,
          status: "INVALID" as const,
          data: {},
          errors: row.errors,
        };
      }

      const errors = [...row.errors];
      const normalizedDocument = row.data.document
        ? this.normalizeDocument(row.data.document)
        : undefined;

      if (normalizedDocument) {
        if (seenDocuments.has(normalizedDocument)) {
          errors.push("Documento duplicado no arquivo de importação.");
        } else if (existingDocuments.has(normalizedDocument)) {
          errors.push("Documento já cadastrado para outra empresa.");
        } else {
          seenDocuments.add(normalizedDocument);
        }
      }

      return {
        rowNumber: row.rowNumber,
        status: errors.length === 0 ? ("VALID" as const) : ("INVALID" as const),
        data: row.data,
        errors,
      };
    });

    const valid = rows.filter(row => row.status === "VALID").length;

    return {
      fingerprint: createHash("sha256")
        .update(parsedCsv.normalizedContent)
        .digest("hex"),
      processed: rows.length,
      valid,
      invalid: rows.length - valid,
      rows,
    };
  }

  async confirm(
    file: Buffer,
    fingerprint: string,
    context: CompanyAdministrationContext
  ): Promise<CompanyImportResult> {
    const preview = await this.preview(file, context.organizationId);

    if (preview.fingerprint !== fingerprint) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message:
          "O arquivo foi alterado após o preview. Gere um novo preview antes de confirmar.",
      });
    }

    const rows: CompanyImportResult["rows"] = [];

    for (const row of preview.rows) {
      if (row.status === "INVALID") {
        rows.push({
          rowNumber: row.rowNumber,
          status: "REJECTED",
          errors: row.errors,
        });
        continue;
      }

      const input = CompanyCreateInputSchema.parse(row.data);
      const company = await this.companies.create(input, context);
      rows.push({
        rowNumber: row.rowNumber,
        status: "IMPORTED",
        companyId: company.id,
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

  private validateRow(row: {
    rowNumber: number;
    data: Record<string, string | undefined>;
  }): ValidatedRow {
    const candidate = Object.fromEntries(
      Object.entries(row.data)
        .map(([key, value]) => [key, value?.trim()])
        .filter(([, value]) => value !== undefined && value !== "")
    );
    const result = CompanyCreateInputSchema.safeParse(candidate);

    if (!result.success) {
      return {
        rowNumber: row.rowNumber,
        errors: result.error.issues.map(issue => issue.message),
      };
    }

    return {
      rowNumber: row.rowNumber,
      data: result.data,
      errors: [],
    };
  }

  private normalizeDocument(document: string): string {
    return document.trim().toLocaleLowerCase("pt-BR");
  }
}
