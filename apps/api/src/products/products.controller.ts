import {
  ProductCreateInputSchema,
  ProductListQuerySchema,
  ProductUpdateInputSchema,
  type ProductCreateInput,
  type ProductListQuery,
  type ProductUpdateInput,
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
import { ProductsService } from "./products.service";

const ProductIdSchema = z.string().uuid();

type ProductRequest = AuthenticatedRequest & RequestWithId;

@Controller("products")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService
  ) {}

  @Get()
  @RequirePermissions("product.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: ProductRequest
  ) {
    return this.products.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("product.read")
  read(@Param("id") id: string, @Req() request: ProductRequest) {
    return this.products.read(
      this.parseProductId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("product.write")
  create(@Body() body: unknown, @Req() request: ProductRequest) {
    return this.products.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("product.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: ProductRequest
  ) {
    return this.products.update(
      this.parseProductId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("product.write")
  async remove(
    @Param("id") id: string,
    @Req() request: ProductRequest
  ): Promise<void> {
    await this.products.remove(
      this.parseProductId(id),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): ProductListQuery {
    const parsed = ProductListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseProductId(id: string): string {
    const parsed = ProductIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de produto inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): ProductCreateInput {
    const parsed = ProductCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): ProductUpdateInput {
    const parsed = ProductUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: ProductRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: ProductRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
