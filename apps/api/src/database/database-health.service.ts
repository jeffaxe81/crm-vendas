import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async isReady(): Promise<boolean> {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return true;
  }
}
