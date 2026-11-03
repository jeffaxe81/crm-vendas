import { PrismaService } from "../database/prisma.service";

const expectedTables = [
  "knowledge_items",
  "knowledge_companies",
  "knowledge_contacts",
  "knowledge_opportunities",
] as const;

const expectedEnums = [
  "knowledge_item_type",
  "knowledge_access_level",
  "knowledge_ai_status",
] as const;

describe("Cycle 5 knowledge database schema", () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it("creates every knowledge table through versioned migrations", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY(ARRAY[${expectedTables
           .map(table => `'${table}'`)
           .join(", ")}])
       ORDER BY tablename`
    );

    expect(rows.map(row => row.tablename).sort()).toEqual(
      [...expectedTables].sort()
    );
  });

  it("creates the canonical knowledge enums", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ typname: string }>>(
      `SELECT typname
       FROM pg_type
       WHERE typname = ANY(ARRAY[${expectedEnums
         .map(type => `'${type}'`)
         .join(", ")}])
       ORDER BY typname`
    );

    expect(rows.map(row => row.typname).sort()).toEqual(
      [...expectedEnums].sort()
    );
  });

  it("enables row level security on every knowledge table", async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ relname: string; relrowsecurity: boolean }>
    >(
      `SELECT c.relname, c.relrowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY(ARRAY[${expectedTables
           .map(table => `'${table}'`)
           .join(", ")}])
       ORDER BY c.relname`
    );

    expect(rows).toHaveLength(expectedTables.length);
    expect(rows.every(row => row.relrowsecurity)).toBe(true);
  });
});
