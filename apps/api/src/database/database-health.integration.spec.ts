import { DatabaseHealthService } from './database-health.service';
import { PrismaService } from './prisma.service';

describe('DatabaseHealthService integration', () => {
  const prisma = new PrismaService();
  const service = new DatabaseHealthService(prisma);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('confirms PostgreSQL connectivity', async () => {
    await expect(service.isReady()).resolves.toBe(true);
  });
});
