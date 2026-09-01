import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { RequestWithId } from '../observability/request-id.middleware';

type ErrorEnvelope = {
  code: string;
  message: string;
  request_id: string;
  details: unknown[];
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const httpResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message = this.resolveMessage(status, httpResponse);
    const details = this.resolveDetails(httpResponse);
    const requestId =
      request.requestId ??
      request.header('x-request-id') ??
      'request-id-unavailable';

    if (!(exception instanceof HttpException) || status >= 500) {
      this.logger.error(
        'Unhandled API error',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope: ErrorEnvelope = {
      code: this.resolveCode(status),
      message,
      request_id: requestId,
      details,
    };

    response.status(status).json(envelope);
  }

  private resolveCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTHENTICATION_REQUIRED';
      case HttpStatus.FORBIDDEN:
        return 'ACCESS_DENIED';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    }
  }

  private resolveMessage(status: number, response: string | object | null): string {
    if (status >= 500) {
      return 'Ocorreu uma falha interna. Utilize o identificador da requisição para suporte.';
    }

    if (typeof response === 'string') {
      return response;
    }

    if (response && 'message' in response) {
      const value = (response as { message?: unknown }).message;
      if (typeof value === 'string') {
        return value;
      }
    }

    return 'Não foi possível concluir a requisição.';
  }

  private resolveDetails(response: string | object | null): unknown[] {
    if (!response || typeof response === 'string' || !('message' in response)) {
      return [];
    }

    const value = (response as { message?: unknown }).message;
    return Array.isArray(value) ? value : [];
  }
}
