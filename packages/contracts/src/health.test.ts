import { describe, expect, it } from 'vitest';

import { createHealthResponse, HealthResponseSchema } from './health';

describe('health contract', () => {
  it('creates and validates the stable health response', () => {
    const response = createHealthResponse('api');

    expect(response).toEqual({
      status: 'ok',
      service: 'api',
    });
    expect(HealthResponseSchema.parse(response)).toEqual(response);
  });
});
