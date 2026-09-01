import { describe, expect, it } from 'vitest';

import { parsePublicEnvironment } from './public-environment';

describe('parsePublicEnvironment', () => {
  it('rejects an invalid API URL', () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_API_BASE_URL: 'api-local',
      }),
    ).toThrow();
  });

  it('accepts the public API base URL', () => {
    expect(
      parsePublicEnvironment({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      }),
    ).toEqual({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
    });
  });
});
