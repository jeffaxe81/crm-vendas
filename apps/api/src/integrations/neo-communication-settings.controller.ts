import { Body, Controller, Get, Inject, Put, Req, UnauthorizedException, UseGuards, ForbiddenException, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

const settingsSchema = z.object({
  enabled: z.boolean(),
  url: z.string().trim().max(2048).refine(value => !value || (() => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password &&
        !url.search && !url.hash;
    } catch { return false; }
  })(), "A URL deve usar HTTPS, sem credenciais ou parâmetros."),
  mode: z.enum(["iframe", "tab"]),
  height: z.number().int().min(320).max(1600),
  maxWidth: z.number().int().min(320).max(1600),
}).refine(value => !value.enabled || Boolean(value.url), "Informe a URL quando a comunicação estiver habilitada.");

type Settings = z.infer<typeof settingsSchema>;
type SettingsRow = {
  enabled: boolean; neo_url: string | null; opening_mode: string;
  frame_height: number; frame_max_width: number;
};

@Controller("integrations/neo-communication")
@UseGuards(AuthenticationGuard)
export class NeoCommunicationSettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private principal(req: AuthenticatedRequest) {
    if (!req.auth) throw new UnauthorizedException();
    if (req.auth.authMethod !== "session") throw new ForbiddenException("Exige sessão de usuário.");
    return req.auth;
  }

  private async readRow(org: string): Promise<SettingsRow | undefined> {
    return this.prisma.withTenant(org, async tx => {
      const rows = await tx.$queryRaw<SettingsRow[]>`
        SELECT enabled, neo_url, opening_mode, frame_height, frame_max_width
        FROM neo_communication_settings WHERE organization_id = ${org}::uuid
      `;
      return rows[0];
    });
  }

  @Get()
  async read(@Req() req: AuthenticatedRequest) {
    const actor = this.principal(req);
    if (!actor.permissions.includes("ticket.read") && !actor.permissions.includes("integration.read") && !actor.permissions.includes("integration.manage"))
      throw new ForbiddenException();
    const row = await this.readRow(actor.organizationId);
    return row ? {
      enabled: row.enabled, url: row.neo_url ?? "", mode: row.opening_mode,
      height: row.frame_height, maxWidth: row.frame_max_width,
    } : { enabled: false, url: "", mode: "tab", height: 800, maxWidth: 1600 };
  }

  @Put()
  async update(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<Settings> {
    const actor = this.principal(req);
    if (!actor.permissions.includes("integration.manage")) throw new ForbiddenException();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Configuração NEO inválida.");
    const input = parsed.data;
    await this.prisma.withTenant(actor.organizationId, async tx => {
      await tx.$executeRaw`
        INSERT INTO neo_communication_settings
          (organization_id, enabled, neo_url, opening_mode, frame_height, frame_max_width)
        VALUES (${actor.organizationId}::uuid, ${input.enabled}, ${input.url || null}, ${input.mode}, ${input.height}, ${input.maxWidth})
        ON CONFLICT (organization_id) DO UPDATE SET
          enabled = EXCLUDED.enabled, neo_url = EXCLUDED.neo_url,
          opening_mode = EXCLUDED.opening_mode, frame_height = EXCLUDED.frame_height,
          frame_max_width = EXCLUDED.frame_max_width, updated_at = now()
      `;
      await tx.auditLog.create({data: {
        organizationId: actor.organizationId, actorUserId: actor.userId,
        requestId: req.requestId ?? "neo-communication",
        action: "integration.neo.settings.updated",
        entityType: "neo_communication_settings",
        entityId: actor.organizationId,
        metadata: { enabled: input.enabled, mode: input.mode },
      }});
    });
    return input;
  }
}
