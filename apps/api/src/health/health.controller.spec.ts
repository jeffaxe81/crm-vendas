import { Test } from "@nestjs/testing";

import { DatabaseHealthService } from "../database/database-health.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports API and database readiness", async () => {
    let readinessChecks = 0;
    const databaseHealth = {
      isReady: async () => {
        readinessChecks += 1;
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseHealthService,
          useValue: databaseHealth,
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);

    await expect(controller.read()).resolves.toEqual({
      status: "ok",
      service: "api",
      database: "up",
    });
    expect(readinessChecks).toBe(1);
  });
});
