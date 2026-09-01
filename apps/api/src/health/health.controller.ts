import { createHealthResponse } from '@axes/contracts';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  read() {
    return createHealthResponse('api');
  }
}
