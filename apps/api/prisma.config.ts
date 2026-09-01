import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDevelopmentDatabaseUrl =
  'postgresql://axes:axes@localhost:5432/axes_crm';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? localDevelopmentDatabaseUrl,
  },
});
