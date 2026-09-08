import type {
  CustomFieldDefinitionInput,
  CustomFieldScope,
} from "@axes/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { validateCustomFieldValue } from "./custom-field-value";

export type CustomFieldAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type CustomFieldDefinitionUpdateInput = {
  label?: string;
  isRequired?: boolean;
  options?: string[];
  isActive?: boolean;
};

type AuditableDefinition = {
  scope: CustomFieldScope;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
  isRequired: boolean;
  options: Prisma.JsonValue | null;
  isActive: boolean;
};

@Injectable()
export class CustomFieldsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async listDefinitions(scope: CustomFieldScope, organizationId: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { organizationId, scope },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    });
  }

  async createDefinition(
    input: CustomFieldDefinitionInput,
    context: CustomFieldAdministrationContext
  ) {
    this.validateDefinitionOptions(input.type, input.options);

    const existing = await this.prisma.customFieldDefinition.findFirst({
      where: {
        organizationId: context.organizationId,
        scope: input.scope,
        key: input.key,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: "CUSTOM_FIELD_ALREADY_EXISTS",
        message: "Já existe um campo customizável com esta chave e escopo.",
      });
    }

    const definition = await this.prisma.customFieldDefinition.create({
      data: {
        organizationId: context.organizationId,
        scope: input.scope,
        key: input.key,
        label: input.label,
        type: input.type,
        isRequired: input.isRequired,
        options: input.options,
        isActive: input.isActive,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.created",
      entityType: "custom_field_definition",
      entityId: definition.id,
      after: this.toAuditDefinition(definition),
      ipAddress: context.ipAddress ?? null,
    });

    return definition;
  }

  async updateDefinition(
    id: string,
    input: CustomFieldDefinitionUpdateInput,
    context: CustomFieldAdministrationContext
  ) {
    const existing = await this.requireDefinitionById(
      id,
      context.organizationId
    );

    if (input.options !== undefined) {
      this.validateDefinitionOptions(existing.type, input.options);
    }

    const updated = await this.prisma.customFieldDefinition.update({
      where: { id: existing.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.isRequired !== undefined
          ? { isRequired: input.isRequired }
          : {}),
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.updated",
      entityType: "custom_field_definition",
      entityId: updated.id,
      before: this.toAuditDefinition(existing),
      after: this.toAuditDefinition(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async listCompanyValues(companyId: string, organizationId: string) {
    await this.requireCompany(companyId, organizationId);

    return this.prisma.companyCustomFieldValue.findMany({
      where: { organizationId, companyId },
      include: { definition: true },
      orderBy: [{ definition: { label: "asc" } }, { id: "asc" }],
    });
  }

  async setCompanyValue(
    companyId: string,
    definitionId: string,
    value: unknown,
    context: CustomFieldAdministrationContext
  ) {
    const [, definition] = await Promise.all([
      this.requireCompany(companyId, context.organizationId),
      this.requireDefinition(definitionId, context.organizationId, "COMPANY"),
    ]);
    const validated = this.validateValue(definition, value);
    const existing = await this.prisma.companyCustomFieldValue.findFirst({
      where: {
        organizationId: context.organizationId,
        companyId,
        definitionId,
      },
    });

    const stored = await this.prisma.companyCustomFieldValue.upsert({
      where: {
        organizationId_companyId_definitionId: {
          organizationId: context.organizationId,
          companyId,
          definitionId,
        },
      },
      create: {
        organizationId: context.organizationId,
        companyId,
        definitionId,
        value: validated,
      },
      update: { value: validated },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.value_set",
      entityType: "company_custom_field_value",
      entityId: stored.id,
      before: existing
        ? ({ value: existing.value } as Prisma.InputJsonValue)
        : undefined,
      after: { value: stored.value } as Prisma.InputJsonValue,
      metadata: { companyId, definitionId },
      ipAddress: context.ipAddress ?? null,
    });

    return stored;
  }

  async removeCompanyValue(
    companyId: string,
    definitionId: string,
    context: CustomFieldAdministrationContext
  ): Promise<void> {
    await Promise.all([
      this.requireCompany(companyId, context.organizationId),
      this.requireDefinition(definitionId, context.organizationId, "COMPANY"),
    ]);

    const existing = await this.prisma.companyCustomFieldValue.findFirst({
      where: {
        organizationId: context.organizationId,
        companyId,
        definitionId,
      },
    });

    if (!existing) {
      throw this.valueNotFound();
    }

    await this.prisma.companyCustomFieldValue.delete({
      where: { id: existing.id },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.value_removed",
      entityType: "company_custom_field_value",
      entityId: existing.id,
      before: { value: existing.value } as Prisma.InputJsonValue,
      metadata: { companyId, definitionId },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async listContactValues(contactId: string, organizationId: string) {
    await this.requireContact(contactId, organizationId);

    return this.prisma.contactCustomFieldValue.findMany({
      where: { organizationId, contactId },
      include: { definition: true },
      orderBy: [{ definition: { label: "asc" } }, { id: "asc" }],
    });
  }

  async setContactValue(
    contactId: string,
    definitionId: string,
    value: unknown,
    context: CustomFieldAdministrationContext
  ) {
    const [, definition] = await Promise.all([
      this.requireContact(contactId, context.organizationId),
      this.requireDefinition(definitionId, context.organizationId, "CONTACT"),
    ]);
    const validated = this.validateValue(definition, value);
    const existing = await this.prisma.contactCustomFieldValue.findFirst({
      where: {
        organizationId: context.organizationId,
        contactId,
        definitionId,
      },
    });

    const stored = await this.prisma.contactCustomFieldValue.upsert({
      where: {
        organizationId_contactId_definitionId: {
          organizationId: context.organizationId,
          contactId,
          definitionId,
        },
      },
      create: {
        organizationId: context.organizationId,
        contactId,
        definitionId,
        value: validated,
      },
      update: { value: validated },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.value_set",
      entityType: "contact_custom_field_value",
      entityId: stored.id,
      before: existing
        ? ({ value: existing.value } as Prisma.InputJsonValue)
        : undefined,
      after: { value: stored.value } as Prisma.InputJsonValue,
      metadata: { contactId, definitionId },
      ipAddress: context.ipAddress ?? null,
    });

    return stored;
  }

  async removeContactValue(
    contactId: string,
    definitionId: string,
    context: CustomFieldAdministrationContext
  ): Promise<void> {
    await Promise.all([
      this.requireContact(contactId, context.organizationId),
      this.requireDefinition(definitionId, context.organizationId, "CONTACT"),
    ]);

    const existing = await this.prisma.contactCustomFieldValue.findFirst({
      where: {
        organizationId: context.organizationId,
        contactId,
        definitionId,
      },
    });

    if (!existing) {
      throw this.valueNotFound();
    }

    await this.prisma.contactCustomFieldValue.delete({
      where: { id: existing.id },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "custom_field.value_removed",
      entityType: "contact_custom_field_value",
      entityId: existing.id,
      before: { value: existing.value } as Prisma.InputJsonValue,
      metadata: { contactId, definitionId },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private validateDefinitionOptions(
    type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT",
    options: string[] | undefined
  ): void {
    if (type === "SELECT") {
      if (!options || options.length === 0) {
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Campos SELECT exigem ao menos uma opção.",
        });
      }
      return;
    }

    if (options !== undefined) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Opções são permitidas apenas em campos SELECT.",
      });
    }
  }

  private validateValue(
    definition: {
      type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
      options: Prisma.JsonValue | null;
    },
    value: unknown
  ): Prisma.InputJsonValue {
    try {
      return validateCustomFieldValue(
        definition,
        value
      ) as Prisma.InputJsonValue;
    } catch (error) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Valor customizado inválido.",
      });
    }
  }

  private async requireDefinitionById(id: string, organizationId: string) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, organizationId },
    });

    if (!definition) {
      throw this.definitionNotFound();
    }

    return definition;
  }

  private async requireDefinition(
    id: string,
    organizationId: string,
    scope: CustomFieldScope
  ) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, organizationId, scope },
    });

    if (!definition) {
      throw this.definitionNotFound();
    }

    return definition;
  }

  private async requireCompany(id: string, organizationId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException({
        code: "COMPANY_NOT_FOUND",
        message: "Empresa não encontrada.",
      });
    }

    return company;
  }

  private async requireContact(id: string, organizationId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!contact) {
      throw new NotFoundException({
        code: "CONTACT_NOT_FOUND",
        message: "Contato não encontrado.",
      });
    }

    return contact;
  }

  private definitionNotFound(): NotFoundException {
    return new NotFoundException({
      code: "CUSTOM_FIELD_NOT_FOUND",
      message: "Campo customizável não encontrado.",
    });
  }

  private valueNotFound(): NotFoundException {
    return new NotFoundException({
      code: "CUSTOM_FIELD_VALUE_NOT_FOUND",
      message: "Valor customizado não encontrado.",
    });
  }

  private toAuditDefinition(
    definition: AuditableDefinition
  ): Prisma.InputJsonValue {
    return {
      scope: definition.scope,
      key: definition.key,
      label: definition.label,
      type: definition.type,
      isRequired: definition.isRequired,
      options: definition.options,
      isActive: definition.isActive,
    } as Prisma.InputJsonValue;
  }
}
