import { createHealthResponse } from "@axes/contracts";
import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { DatabaseHealthService } from "../database/database-health.service";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

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
    } catch (error) {
      // Registra o motivo real (ex.: "password authentication failed for user
      // axes_app") para o diagnóstico. A mensagem do driver não contém a senha;
      // a resposta HTTP continua sem detalhes internos.
      this.logger.error(
        `readiness: database down — ${error instanceof Error ? error.message : String(error)}`
      );
      throw new ServiceUnavailableException(
        createHealthResponse("api", "down")
      );
    }
  }
}
