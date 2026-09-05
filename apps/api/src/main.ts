import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { parseApiEnvironment } from "./config/environment";
import { ApiErrorFilter } from "./errors/api-error.filter";

async function bootstrap() {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ApiErrorFilter());
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id"],
  });

  await app.listen(environment.PORT, "0.0.0.0");
}

void bootstrap();
