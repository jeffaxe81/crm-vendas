import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({
  path: "../../.env",
});

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://axes:axes@localhost:5432/axes_crm";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
