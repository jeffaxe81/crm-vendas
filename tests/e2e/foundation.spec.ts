import { expect, test } from '@playwright/test';

test('web and API foundation are available', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:3000');

  await expect(
    page.getByRole('heading', { name: 'CRM Axesistemas' }),
  ).toBeVisible();
  await expect(page.getByText('Fundação preparada')).toBeVisible();

  const response = await request.get(
    'http://127.0.0.1:3001/api/v1/health',
  );

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: 'ok',
    service: 'api',
    database: 'up',
  });
});
