import { Module } from "@nestjs/common";

@Module({})
class TestLoggerModule {}

export class LoggerModule {
  static forRoot(): { module: typeof TestLoggerModule } {
    return {
      module: TestLoggerModule,
    };
  }
}
