import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";

export const EMAIL_PROVIDER_CODES = [
  "NONE",
  "GMAIL",
  "MICROSOFT_365",
  "RESEND",
  "AMAZON_SES",
  "SENDGRID",
  "MAILGUN",
  "SMTP",
  "HTTPS_RELAY",
] as const;

export type EmailProviderCode = (typeof EMAIL_PROVIDER_CODES)[number];

export const EMAIL_PROVIDER_CATALOG = [
  { code: "GMAIL", label: "Gmail / Google Workspace", authMethod: "OAUTH2" },
  {
    code: "MICROSOFT_365",
    label: "Microsoft 365 / Outlook",
    authMethod: "OAUTH2",
  },
  { code: "RESEND", label: "Resend", authMethod: "API_KEY" },
  { code: "AMAZON_SES", label: "Amazon SES", authMethod: "AWS_IAM" },
  { code: "SENDGRID", label: "SendGrid", authMethod: "API_KEY" },
  { code: "MAILGUN", label: "Mailgun", authMethod: "API_KEY" },
  { code: "SMTP", label: "SMTP seguro / outro provedor", authMethod: "SMTP" },
  {
    code: "HTTPS_RELAY",
    label: "Relay HTTPS corporativo",
    authMethod: "BEARER",
  },
] as const;

export type EmailProviderPreferenceContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
}>;

export type EmailProviderPreferenceUpdate = Readonly<{
  version: number;
  providerCode: EmailProviderCode;
}>;

type PreferenceRow = Readonly<{ version: number; providerCode: string }>;

function snapshot(row?: PreferenceRow | null) {
  return {
    version: row?.version ?? 0,
    providerCode: row?.providerCode ?? "NONE",
    // No adapter is wired in this cycle.
    sendingEnabled: false,
    connectionStatus: "NOT_CONNECTED" as const,
  };
}

function view(row?: PreferenceRow | null) {
  return { ...snapshot(row), providers: EMAIL_PROVIDER_CATALOG };
}

/**
 * Administrative control plane only. An organization can SELECT a future
 * provider; this service stores no credentials and cannot dispatch e-mails.
 */
@Injectable()
export class EmailProviderPreferenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    context: EmailProviderPreferenceContext
  ) {
    const member = await tx.organizationMembership.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: context.actorUserId,
        isActive: true,
        user: { isActive: true },
        organization: { isActive: true },
        OR: [{ role: "ADMIN" }, { isSuperuser: true }],
      },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({ code: "EMAIL_PROVIDER_ADMIN_REQUIRED" });
    }
  }

  async read(context: EmailProviderPreferenceContext) {
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      return view(
        await tx.emailProviderPreference.findFirst({
          where: { organizationId: context.organizationId },
        })
      );
    });
  }

  async update(
    input: EmailProviderPreferenceUpdate,
    context: EmailProviderPreferenceContext
  ) {
    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      !EMAIL_PROVIDER_CODES.includes(input.providerCode)
    ) {
      throw new BadRequestException({ code: "EMAIL_PROVIDER_CHOICE_INVALID" });
    }
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      const previous = await tx.emailProviderPreference.findFirst({
        where: { organizationId: context.organizationId },
      });
      if ((previous?.version ?? 0) !== input.version) {
        throw new ConflictException({ code: "EMAIL_PROVIDER_VERSION_CONFLICT" });
      }
      if (!previous) {
        const created = await tx.emailProviderPreference.createMany({
          data: [
            {
              organizationId: context.organizationId,
              providerCode: input.providerCode,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count !== 1) {
          throw new ConflictException({
            code: "EMAIL_PROVIDER_VERSION_CONFLICT",
          });
        }
      } else {
        const updated = await tx.emailProviderPreference.updateMany({
          where: {
            organizationId: context.organizationId,
            version: input.version,
          },
          data: {
            providerCode: input.providerCode,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: "EMAIL_PROVIDER_VERSION_CONFLICT",
          });
        }
      }
      const current = await tx.emailProviderPreference.findFirstOrThrow({
        where: { organizationId: context.organizationId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          action: "email.provider_preference.updated",
          entityType: "EmailProviderPreference",
          entityId: context.organizationId,
          before: snapshot(previous),
          after: snapshot(current),
          metadata: { selectionOnly: true },
        },
      });
      return view(current);
    });
  }
}
