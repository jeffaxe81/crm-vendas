import {
  ProductCreateInputSchema,
  type ProductCreateInput,
  type ProductImportPreview,
  type ProductImportPreviewRow,
  type ProductImportResult,
  type ProductImportRowData,
} from "@axes/contracts";
import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  ProductsService,
  type ProductAdministrationContext,
} from "../products/products.service";
import {
  ProductCsvParser,
  normalizeCsvDecimal,
  parseCsvBoolean,
  type ParsedProductCsvRow,
} from "./product-csv-parser";

type ValidatedRow = {
  rowNumber: number;
  data: ProductImportRowData;
  product?: ProductCreateInput;
  errors: string[];
};

export const PRODUCT_IMPORT_ERRORS = {
  duplicateInFile: "Código duplicado no arquivo de importação.",
  alreadyExists: "Código já cadastrado para outro produto.",
  invalidBoolean: "isActive: informe true/false, sim/não ou 1/0.",
} as const;

@Injectable()
export class ProductImportService {
  constructor(
    @Inject(ProductCsvParser) private readonly parser: ProductCsvParser,
    @Inject(ProductsService) private readonly products: ProductsService
  ) {}

  async preview(
    file: Buffer,
    organizationId: string
  ): Promise<ProductImportPreview> {
    const { rows, fingerprint } = await this.validate(file, organizationId);
    const previewRows: ProductImportPreviewRow[] = rows.map(row => {
      const valid = row.errors.length === 0 && row.product !== undefined;
      return {
        rowNumber: row.rowNumber,
        status: valid ? "VALID" : "INVALID",
        data: row.data,
        ...(valid ? { product: row.product } : {}),
        errors: row.errors,
      };
    });
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
    context: ProductAdministrationContext
  ): Promise<ProductImportResult> {
    const validated = await this.validate(file, context.organizationId);

    if (validated.fingerprint !== fingerprint) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message:
          "O arquivo foi alterado após o preview. Gere um novo preview antes de confirmar.",
      });
    }

    const rows: ProductImportResult["rows"] = [];

    for (const row of validated.rows) {
      if (row.errors.length > 0 || !row.product) {
        rows.push({
          rowNumber: row.rowNumber,
          status: "REJECTED",
          errors: row.errors,
        });
        continue;
      }

      try {
        const product = await this.products.create(row.product, context);
        rows.push({
          rowNumber: row.rowNumber,
          status: "IMPORTED",
          productId: product.id,
          errors: [],
        });
      } catch (error) {
        // Corrida com outra requisição que cadastrou o mesmo código entre
        // o preview recalculado e a criação: rejeita só esta linha.
        if (error instanceof ConflictException) {
          rows.push({
            rowNumber: row.rowNumber,
            status: "REJECTED",
            errors: [PRODUCT_IMPORT_ERRORS.alreadyExists],
          });
          continue;
        }
        throw error;
      }
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

    const codes = rows
      .map(row => this.codeKey(row))
      .filter((code): code is string => Boolean(code));
    const existing = await this.products.existingCodes(codes, organizationId);
    const seen = new Set<string>();

    for (const row of rows) {
      const code = this.codeKey(row);
      if (!code) continue;

      if (seen.has(code)) {
        row.errors.push(PRODUCT_IMPORT_ERRORS.duplicateInFile);
      } else if (existing.has(code)) {
        row.errors.push(PRODUCT_IMPORT_ERRORS.alreadyExists);
      }
      seen.add(code);
    }

    return {
      rows,
      fingerprint: createHash("sha256")
        .update(parsed.normalizedContent)
        .digest("hex"),
    };
  }

  private validateRow(row: ParsedProductCsvRow): ValidatedRow {
    const data = Object.fromEntries(
      Object.entries(row.data)
        .map(([key, value]) => [key, value?.trim()])
        .filter(([, value]) => value !== undefined && value !== "")
    ) as ProductImportRowData;

    const errors: string[] = [];
    let isActive = true;
    if (data.isActive !== undefined) {
      const parsed = parseCsvBoolean(data.isActive);
      if (parsed === undefined) {
        errors.push(PRODUCT_IMPORT_ERRORS.invalidBoolean);
      } else {
        isActive = parsed;
      }
    }

    const result = ProductCreateInputSchema.safeParse({
      code: data.code,
      name: data.name,
      unitPrice:
        data.unitPrice !== undefined
          ? normalizeCsvDecimal(data.unitPrice)
          : undefined,
      description: data.description,
      isActive,
    });

    if (!result.success) {
      errors.push(
        ...result.error.issues.map(issue =>
          this.describeIssue(issue.path, issue.message)
        )
      );
    }

    return {
      rowNumber: row.rowNumber,
      data,
      product: result.success ? result.data : undefined,
      errors,
    };
  }

  private codeKey(row: ValidatedRow): string | undefined {
    return row.data.code?.toLocaleLowerCase("pt-BR");
  }

  private describeIssue(path: PropertyKey[], message: string): string {
    const field = path.map(String).join(".");
    return field ? `${field}: ${message}` : message;
  }
}
