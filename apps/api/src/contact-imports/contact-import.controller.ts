import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { CsvValidationError } from "../csv/csv-table-parser";
import { ContactImportService } from "./contact-import.service";

type ContactImportRequest = AuthenticatedRequest & RequestWithId;

type UploadedCsvFile = {
  buffer: Buffer;
  originalname?: string;
};

@Controller("contact-imports")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ContactImportController {
  constructor(
    @Inject(ContactImportService)
    private readonly contactImports: ContactImportService
  ) {}

  @Post("preview")
  @HttpCode(200)
  @RequirePermissions("contact.write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024 },
    })
  )
  async preview(
    @UploadedFile() file: UploadedCsvFile | undefined,
    @Req() request: ContactImportRequest
  ) {
    const csv = this.requireCsvFile(file);

    try {
      return await this.contactImports.preview(
        csv.buffer,
        this.requirePrincipal(request).organizationId
      );
    } catch (error) {
      this.rethrowExpectedValidation(error);
    }
  }

  @Post("confirm")
  @HttpCode(200)
  @RequirePermissions("contact.write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024 },
    })
  )
  async confirm(
    @UploadedFile() file: UploadedCsvFile | undefined,
    @Body("fingerprint") fingerprint: string | undefined,
    @Req() request: ContactImportRequest
  ) {
    const csv = this.requireCsvFile(file);

    if (!fingerprint?.trim()) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Fingerprint do preview é obrigatório.",
      });
    }

    try {
      return await this.contactImports.confirm(
        csv.buffer,
        fingerprint.trim(),
        this.contextFrom(request)
      );
    } catch (error) {
      this.rethrowExpectedValidation(error);
    }
  }

  private requireCsvFile(file: UploadedCsvFile | undefined): UploadedCsvFile {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Arquivo CSV obrigatório.",
      });
    }

    if (
      file.originalname &&
      !file.originalname.toLocaleLowerCase("pt-BR").endsWith(".csv")
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "O arquivo deve possuir extensão .csv.",
      });
    }

    return file;
  }

  private rethrowExpectedValidation(error: unknown): never {
    if (error instanceof CsvValidationError) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    throw error;
  }

  private requirePrincipal(request: ContactImportRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: ContactImportRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
