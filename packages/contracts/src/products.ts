import { z } from "zod";

import { PaginationQuerySchema } from "./companies";
import { OpportunityDecimalSchema } from "./opportunities";

export const ProductCreateInputSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  unitPrice: OpportunityDecimalSchema,
  isActive: z.boolean().default(true),
});

export const ProductUpdateInputSchema = z
  .object({
    code: z.string().trim().min(1).max(60).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    unitPrice: OpportunityDecimalSchema.optional(),
    isActive: z.boolean().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    { message: "Informe ao menos uma alteração além de version." }
  );

export const ProductListQuerySchema = PaginationQuerySchema.extend({
  active: z
    .enum(["true", "false", "all"])
    .default("all")
    .transform(value => (value === "all" ? undefined : value === "true")),
  sortBy: z.enum(["name", "code", "updatedAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

/** Quantidade positiva com até 9 dígitos inteiros e 3 casas decimais. */
export const OpportunityItemQuantitySchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
    "Informe uma quantidade com até 9 dígitos inteiros e 3 casas decimais."
  )
  .refine(value => Number(value) > 0, "A quantidade deve ser maior que zero.");

/** Desconto percentual entre 0 e 100, com até 2 casas decimais. */
export const OpportunityItemDiscountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,2})(\.\d{1,2})?$/,
    "Informe um desconto percentual com até 2 casas decimais."
  )
  .refine(value => Number(value) <= 100, "O desconto não pode passar de 100%.");

export const OpportunityItemCreateInputSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: OpportunityItemQuantitySchema,
    unitPrice: OpportunityDecimalSchema.optional(),
    discountPercent: OpportunityItemDiscountSchema.default("0"),
    version: z.number().int().min(1),
  })
  .strict();

export const OpportunityItemUpdateInputSchema = z
  .object({
    quantity: OpportunityItemQuantitySchema.optional(),
    unitPrice: OpportunityDecimalSchema.optional(),
    discountPercent: OpportunityItemDiscountSchema.optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    { message: "Informe ao menos uma alteração além de version." }
  );

export type ProductCreateInput = z.infer<typeof ProductCreateInputSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateInputSchema>;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
export type OpportunityItemCreateInput = z.infer<
  typeof OpportunityItemCreateInputSchema
>;
export type OpportunityItemUpdateInput = z.infer<
  typeof OpportunityItemUpdateInputSchema
>;

/** Cálculo canônico do total da linha (usado pela API e pela UI). */
export function calculateLineTotalCents(input: {
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}): bigint {
  // Aritmética inteira: quantity em milésimos, preço em centavos e
  // desconto em centésimos de ponto percentual.
  const toScaled = (value: string, scale: number): bigint => {
    const [integer = "0", fraction = ""] = value.split(".");
    return BigInt(integer + fraction.padEnd(scale, "0").slice(0, scale));
  };
  const quantity = toScaled(input.quantity, 3);
  const price = toScaled(input.unitPrice, 2);
  const keep = 10_000n - toScaled(input.discountPercent, 2);
  // cents = quantity/1000 * price * keep/10000, arredondado half-up
  const numerator = quantity * price * keep;
  const denominator = 10_000_000n;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Maior valor em centavos que cabe em DECIMAL(19,2). */
export const MAX_MONEY_CENTS = 10n ** 19n - 1n;

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const integer = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}
