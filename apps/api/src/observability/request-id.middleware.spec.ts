import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { RequestIdMiddleware } from "./request-id.middleware";

@Controller("probe")
class ProbeController {
  @Get()
  read() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [ProbeController],
})
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

describe("RequestIdMiddleware", () => {
  it("generates a UUID when the request has no accepted correlation id", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get("/probe")
      .expect(200);

    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    await app.close();
  });

  it("preserves a valid incoming correlation id", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get("/probe")
      .set("x-request-id", "crm-request-1234")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("crm-request-1234");

    await app.close();
  });
});
