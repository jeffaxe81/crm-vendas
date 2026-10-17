import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { buildCorsOrigins, parseApiEnvironment } from "./config/environment";
import { ApiErrorFilter } from "./errors/api-error.filter";

async function bootstrap() {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ApiErrorFilter());
  app.setGlobalPrefix("api/v1");
  // Inline tenant logos (até 256 KB) ultrapassam o limite padrão de 100 KB.
  app.useBodyParser("json", { limit: "1mb" });
  app.enableCors({
    origin: buildCorsOrigins(environment),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id", "Content-Disposition"],
  });

  await app.listen(environment.PORT, "0.0.0.0");
}

void bootstrap();
