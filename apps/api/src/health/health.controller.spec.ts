import { Test } from '@nestjs/testing';

import { DatabaseHealthService } from '../database/database-health.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports API and database readiness', async () => {
    const databaseHealth = {
      isReady: jest.fn().mockResolvedValue(true),
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

    await expect(controller.read()).resolves.toEqual({
      status: 'ok',
      service: 'api',
      database: 'up',
    });
    expect(databaseHealth.isReady).toHaveBeenCalledTimes(1);
  });
});
