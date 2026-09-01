import { createHealthResponse } from "@axes/contracts";
import { Controller, Get } from "@nestjs/common";

import { DatabaseHealthService } from "../database/database-health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  @Get()
  async read() {
    await this.databaseHealth.isReady();
    return createHealthResponse("api", "up");
  }
}
