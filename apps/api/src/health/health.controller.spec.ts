import { Test } from "@nestjs/testing";

import { DatabaseHealthService } from "../database/database-health.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports API liveness without requiring the database", async () => {
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

    expect(controller.live()).toEqual({
      status: "ok",
      service: "api",
    });
    expect(readinessChecks).toBe(0);
  });

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

    await expect(controller.readiness()).resolves.toEqual({
      status: "ok",
      service: "api",
      database: "up",
    });
    expect(readinessChecks).toBe(1);
  });

  it("returns service unavailable when the database is not ready", async () => {
    const databaseHealth = {
      isReady: async () => {
        throw new Error("database unavailable");
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

    await expect(controller.readiness()).rejects.toMatchObject({
      status: 503,
      response: {
        status: "error",
        service: "api",
        database: "down",
      },
    });
  });
});
