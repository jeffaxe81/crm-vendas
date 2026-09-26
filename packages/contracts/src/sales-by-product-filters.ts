import { z } from "zod";

/**
 * Responsável que pode ser usado no filtro `ownerUserId` do relatório de
 * vendas por produto: dono de ao menos uma oportunidade não excluída do tenant.
 * Não expõe e-mail nem papel (o diretório de usuários exige `user.manage`).
 */
export const SalesByProductOwnerSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  membershipActive: z.boolean(),
});

export const SalesByProductOwnersSchema = z.array(SalesByProductOwnerSchema);

export type SalesByProductOwner = z.infer<typeof SalesByProductOwnerSchema>;
