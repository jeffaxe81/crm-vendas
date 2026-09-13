import {
  CompanyCreateInputSchema,
  type CompanyCreateInput,
  type CompanyImportPreview,
} from "@axes/contracts";
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { CompaniesService } from "../companies/companies.service";
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
