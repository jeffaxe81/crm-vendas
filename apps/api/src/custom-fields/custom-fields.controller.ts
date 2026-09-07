import {
  CustomFieldDefinitionInputSchema,
  CustomFieldScopeSchema,
  CustomFieldValueInputSchema,
  type CustomFieldDefinitionInput,
  type CustomFieldScope,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import {
  CustomFieldsService,
  type CustomFieldDefinitionUpdateInput,
} from "./custom-fields.service";

const EntityIdSchema = z.string().uuid();
const CustomFieldDefinitionUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    isRequired: z.boolean().optional(),
    options: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(50)
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualização.",
  });

type CustomFieldRequest = AuthenticatedRequest & RequestWithId;

function parseId(id: string, entity: string): string {
  const parsed = EntityIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: `Identificador de ${entity} inválido.`,
    });
  }
  return parsed.data;
}

function contextFrom(request: CustomFieldRequest) {
  if (!request.auth) {
    throw new Error("Authenticated principal unavailable after guard.");
  }

  return {
    organizationId: request.auth.organizationId,
    actorUserId: request.auth.userId,
    requestId: request.requestId ?? "request-id-unavailable",
    ipAddress: request.ip,
  };
}

function organizationIdFrom(request: CustomFieldRequest): string {
  if (!request.auth) {
    throw new Error("Authenticated principal unavailable after guard.");
  }
  return request.auth.organizationId;
}

function validationError(messages: string | string[]): BadRequestException {
  return new BadRequestException({
    code: "VALIDATION_ERROR",
    message: messages,
  });
}

@Controller("custom-fields")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class CustomFieldsController {
  constructor(
    @Inject(CustomFieldsService)
    private readonly customFields: CustomFieldsService
  ) {}

  @Get()
  @RequirePermissions("company.read", "contact.read")
  list(@Query("scope") scope: string | undefined, @Req() request: CustomFieldRequest) {
    const parsed = CustomFieldScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw validationError("Escopo de campo customizável inválido.");
    }

    return this.customFields.listDefinitions(
      parsed.data,
      organizationIdFrom(request)
    );
  }

  @Post()
  @RequirePermissions("company.write", "contact.write")
  create(@Body() body: unknown, @Req() request: CustomFieldRequest) {
    return this.customFields.createDefinition(
      this.parseDefinition(body),
      contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("company.write", "contact.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: CustomFieldRequest
  ) {
    return this.customFields.updateDefinition(
      parseId(id, "campo customizável"),
      this.parseUpdate(body),
      contextFrom(request)
    );
  }

  private parseDefinition(body: unknown): CustomFieldDefinitionInput {
    const parsed = CustomFieldDefinitionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues.map(issue => issue.message));
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): CustomFieldDefinitionUpdateInput {
    const parsed = CustomFieldDefinitionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues.map(issue => issue.message));
    }
    return parsed.data;
  }
}

@Controller("companies/:companyId/custom-fields")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class CompanyCustomFieldsController {
  constructor(
    @Inject(CustomFieldsService)
    private readonly customFields: CustomFieldsService
  ) {}

  @Get()
  @RequirePermissions("company.read")
  list(
    @Param("companyId") companyId: string,
    @Req() request: CustomFieldRequest
  ) {
    return this.customFields.listCompanyValues(
      parseId(companyId, "empresa"),
      organizationIdFrom(request)
    );
  }

  @Put(":definitionId")
  @RequirePermissions("company.write")
  set(
    @Param("companyId") companyId: string,
    @Param("definitionId") definitionId: string,
    @Body() body: unknown,
    @Req() request: CustomFieldRequest
  ) {
    return this.customFields.setCompanyValue(
      parseId(companyId, "empresa"),
      parseId(definitionId, "campo customizável"),
      this.parseValue(body),
      contextFrom(request)
    );
  }

  @Delete(":definitionId")
  @HttpCode(204)
  @RequirePermissions("company.write")
  async remove(
    @Param("companyId") companyId: string,
    @Param("definitionId") definitionId: string,
    @Req() request: CustomFieldRequest
  ): Promise<void> {
    await this.customFields.removeCompanyValue(
      parseId(companyId, "empresa"),
      parseId(definitionId, "campo customizável"),
      contextFrom(request)
    );
  }

  private parseValue(body: unknown): unknown {
    const parsed = CustomFieldValueInputSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues.map(issue => issue.message));
    }
    return parsed.data.value;
  }
}

@Controller("contacts/:contactId/custom-fields")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ContactCustomFieldsController {
  constructor(
    @Inject(CustomFieldsService)
    private readonly customFields: CustomFieldsService
  ) {}

  @Get()
  @RequirePermissions("contact.read")
  list(
    @Param("contactId") contactId: string,
    @Req() request: CustomFieldRequest
  ) {
    return this.customFields.listContactValues(
      parseId(contactId, "contato"),
      organizationIdFrom(request)
    );
  }

  @Put(":definitionId")
  @RequirePermissions("contact.write")
  set(
    @Param("contactId") contactId: string,
    @Param("definitionId") definitionId: string,
    @Body() body: unknown,
    @Req() request: CustomFieldRequest
  ) {
    return this.customFields.setContactValue(
      parseId(contactId, "contato"),
      parseId(definitionId, "campo customizável"),
      this.parseValue(body),
      contextFrom(request)
    );
  }

  @Delete(":definitionId")
  @HttpCode(204)
  @RequirePermissions("contact.write")
  async remove(
    @Param("contactId") contactId: string,
    @Param("definitionId") definitionId: string,
    @Req() request: CustomFieldRequest
  ): Promise<void> {
    await this.customFields.removeContactValue(
      parseId(contactId, "contato"),
      parseId(definitionId, "campo customizável"),
      contextFrom(request)
    );
  }

  private parseValue(body: unknown): unknown {
    const parsed = CustomFieldValueInputSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues.map(issue => issue.message));
    }
    return parsed.data.value;
  }
}
