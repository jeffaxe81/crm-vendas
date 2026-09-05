import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incoming = request.header("x-request-id");
    const requestId =
      incoming && ACCEPTED_REQUEST_ID.test(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  }
}
