import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NotFoundException,
  type NestModule,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { RequestIdMiddleware } from "../observability/request-id.middleware";
import { ApiErrorFilter } from "./api-error.filter";

@Controller("missing")
class MissingController {
  @Get()
  read(): never {
    throw new NotFoundException("Recurso não encontrado.");
  }
}

@Module({
  controllers: [MissingController],
})
class ErrorProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

describe("ApiErrorFilter", () => {
  it("returns the approved error envelope", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorProbeModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();

    const response = await request(app.getHttpServer())
      .get("/missing")
      .set("x-request-id", "crm-request-404")
      .expect(404);

    expect(response.body).toEqual({
      code: "RESOURCE_NOT_FOUND",
      message: "Recurso não encontrado.",
      request_id: "crm-request-404",
      details: [],
    });

    await app.close();
  });
});
