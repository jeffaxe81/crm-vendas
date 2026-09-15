import { createHealthResponse } from "@axes/contracts";
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";

import { DatabaseHealthService } from "../database/database-health.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseHealthService)
    private readonly databaseHealth: DatabaseHealthService
  ) {}

  @Get("live")
  live() {
    return createHealthResponse("api");
  }

  @Get()
  async read() {
    return this.readiness();
  }

  @Get("ready")
  async readiness() {
    try {
      await this.databaseHealth.isReady();
      return createHealthResponse("api", "up");
    } catch {
      throw new ServiceUnavailableException(
        createHealthResponse("api", "down")
      );
    }
  }
}
