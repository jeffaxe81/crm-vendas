import type { ProductCreateInput } from "@axes/contracts";
import { ConflictException } from "@nestjs/common";

import { CsvValidationError } from "../csv/csv-table-parser";
import type {
  ProductAdministrationContext,
  ProductsService,
} from "../products/products.service";
import { ProductCsvParser } from "./product-csv-parser";
import {
  PRODUCT_IMPORT_ERRORS,
  ProductImportService,
} from "./product-import.service";

const context: ProductAdministrationContext = {
  organizationId: "tenant-a",
  actorUserId: "user-a",
  requestId: "req-a",
  ipAddress: "127.0.0.1",
};

const build = (
  existing: string[] = [],
  options: { conflictOn?: string } = {}
) => {
  const existingCalls: Array<{ codes: string[]; organizationId: string }> = [];
  const createCalls: Array<{
    input: ProductCreateInput;
    context: ProductAdministrationContext;
  }> = [];
  const products = {
    existingCodes: async (codes: string[], organizationId: string) => {
      existingCalls.push({ codes, organizationId });
      return new Set(existing);
    },
    create: async (
      input: ProductCreateInput,
      ctx: ProductAdministrationContext
    ) => {
      if (input.code === options.conflictOn) {
        throw new ConflictException({ code: "PRODUCT_CODE_CONFLICT" });
      }
      createCalls.push({ input, context: ctx });
      return { id: `product-${createCalls.length}` };
    },
  } as unknown as ProductsService;

  return {
    existingCalls,
    createCalls,
    service: new ProductImportService(new ProductCsvParser(), products),
  };
};

describe("ProductImportService preview", () => {
  it("normalizes price and isActive without persisting", async () => {
    const { service, createCalls, existingCalls } = build();

    const preview = await service.preview(
      Buffer.from(
        "code;name;unitPrice;description;isActive\nLIC;Licença;1200,50;Anual;não\nIMPL;Implantação;2500;;"
      ),
      "tenant-a"
    );

    expect(preview).toMatchObject({ processed: 2, valid: 2, invalid: 0 });
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.rows[0]).toMatchObject({
      status: "VALID",
      data: { unitPrice: "1200,50", isActive: "não" },
      product: {
        code: "LIC",
        name: "Licença",
        unitPrice: "1200.50",
        description: "Anual",
        isActive: false,
      },
    });
    expect(preview.rows[1]?.product).toEqual({
      code: "IMPL",
      name: "Implantação",
      unitPrice: "2500",
      isActive: true,
    });
    expect(createCalls).toHaveLength(0);
    expect(existingCalls).toEqual([
      { codes: ["lic", "impl"], organizationId: "tenant-a" },
    ]);
  });

  it("reports schema, price and boolean errors per row", async () => {
    const { service } = build();

    const preview = await service.preview(
      Buffer.from(
        'code,name,unitPrice,isActive\n,Sem código,10,\nP2,,10,\nP3,Preço,"1.200,50",\nP4,Negativo,-1,\nP5,Booleano,1,talvez'
      ),
      "tenant-a"
    );

    expect(preview).toMatchObject({ processed: 5, valid: 0, invalid: 5 });
    expect(preview.rows[0]?.errors.join(" ")).toContain("code");
    expect(preview.rows[1]?.errors.join(" ")).toContain("name");
    expect(preview.rows[2]?.errors.join(" ")).toContain("unitPrice");
    expect(preview.rows[3]?.errors.join(" ")).toContain("unitPrice");
    expect(preview.rows[4]?.errors).toEqual([
      PRODUCT_IMPORT_ERRORS.invalidBoolean,
    ]);
    expect(preview.rows.every(row => row.product === undefined)).toBe(true);
  });

  it("flags codes duplicated in the file (case-insensitive) and already registered", async () => {
    const { service } = build(["ja-existe"]);

    const preview = await service.preview(
      Buffer.from(
        "code,name,unitPrice\nSVC,Serviço,1\nsvc,Serviço 2,1\nJA-EXISTE,Antigo,1\nNOVO,Novo,1"
      ),
      "tenant-a"
    );

    expect(preview.rows.map(row => row.status)).toEqual([
      "VALID",
      "INVALID",
      "INVALID",
      "VALID",
    ]);
    expect(preview.rows[1]?.errors).toContain(
      PRODUCT_IMPORT_ERRORS.duplicateInFile
    );
    expect(preview.rows[2]?.errors).toContain(
      PRODUCT_IMPORT_ERRORS.alreadyExists
    );
  });

  it("propagates CSV structure errors", async () => {
    const { service } = build();
    await expect(
      service.preview(Buffer.from("code,name\nA,B"), "tenant-a")
    ).rejects.toBeInstanceOf(CsvValidationError);
  });
});

describe("ProductImportService confirm", () => {
  it("creates only valid rows through ProductsService.create", async () => {
    const { service, createCalls } = build();
    const csv = Buffer.from(
      'code,name,unitPrice\nLIC,Licença,"99,90"\nBAD,Sem preço,abc'
    );
    const preview = await service.preview(csv, context.organizationId);

    const result = await service.confirm(csv, preview.fingerprint, context);

    expect(result).toMatchObject({ processed: 2, imported: 1, rejected: 1 });
    expect(result.rows[0]).toMatchObject({
      status: "IMPORTED",
      productId: "product-1",
    });
    expect(result.rows[1]?.status).toBe("REJECTED");
    expect(createCalls).toEqual([
      {
        input: {
          code: "LIC",
          name: "Licença",
          unitPrice: "99.90",
          isActive: true,
        },
        context,
      },
    ]);
  });

  it("rejects a row whose code was taken concurrently and keeps going", async () => {
    const { service, createCalls } = build([], { conflictOn: "A" });
    const csv = Buffer.from("code,name,unitPrice\nA,Primeiro,1\nB,Segundo,2");
    const preview = await service.preview(csv, context.organizationId);

    const result = await service.confirm(csv, preview.fingerprint, context);

    expect(result).toMatchObject({ imported: 1, rejected: 1 });
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      status: "REJECTED",
      errors: [PRODUCT_IMPORT_ERRORS.alreadyExists],
    });
    expect(createCalls.map(call => call.input.code)).toEqual(["B"]);
  });

  it("refuses a fingerprint that does not match the file", async () => {
    const { service, createCalls } = build();
    await expect(
      service.confirm(
        Buffer.from("code,name,unitPrice\nA,B,1"),
        "0".repeat(64),
        context
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(createCalls).toHaveLength(0);
  });
});
