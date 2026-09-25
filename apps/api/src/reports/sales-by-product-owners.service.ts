import {
  SalesByProductOwnersSchema,
  type SalesByProductOwner,
} from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

type OwnerRow = {
  user_id: string;
  display_name: string;
  membership_active: boolean;
};

/**
 * Lista os responsáveis disponíveis para o filtro do relatório de vendas por
 * produto. O diretório de usuários (`/admin/users`) exige `user.manage`, que o
 * MANAGER não tem; por isso a lista vem dos donos de oportunidades não
 * excluídas do tenant, sem e-mail nem papel.
 */
@Injectable()
export class SalesByProductOwnersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<SalesByProductOwner[]> {
    const rows = await this.prisma.withTenant(
      organizationId,
      tenant =>
        // RLS de opportunities + filtro explícito por organização; a junção
        // com o vínculo é composta pelo tenant.
        tenant.$queryRaw<OwnerRow[]>`
        SELECT
          u.id::text AS user_id,
          u.display_name,
          (m.is_active AND u.is_active) AS membership_active
        FROM (
          SELECT DISTINCT o.owner_user_id, o.organization_id
          FROM opportunities o
          WHERE o.organization_id = ${organizationId}::uuid
            AND o.deleted_at IS NULL
        ) owners
        JOIN organization_memberships m
          ON m.user_id = owners.owner_user_id
         AND m.organization_id = owners.organization_id
        JOIN users u ON u.id = m.user_id
        ORDER BY u.display_name, u.id`
    );

    return SalesByProductOwnersSchema.parse(
      rows.map(row => ({
        userId: row.user_id,
        displayName: row.display_name,
        membershipActive: row.membership_active,
      }))
    );
  }
}
