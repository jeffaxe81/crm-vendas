import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.3.2 product import API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => resetDatabase());

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE
         opportunity_items,
         products,
         audit_logs,
         refresh_sessions,
         organization_memberships,
         users,
         organizations
       CASCADE`
    );
  }

  async function createSession(
    role: "ADMIN" | "MANAGER" | "SELLER" | "VIEWER",
    suffix: string
  ) {
    const organization = await prisma.organization.create({
      data: { name: `Product Import ${suffix}`, slug: `pimport-${suffix}` },
    });
    const password = "Strong-Product-Import-2026!";
    const email = `pimport-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `Product Import ${suffix}`,
        passwordHash: await passwords.hash(password),
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug: organization.slug })
      .expect(200);
    return {
      organization,
      user,
      token: login.body.accessToken as string,
    };
  }

  const url = (path: "preview" | "confirm") =>
    `/api/v1/product-imports/${path}`;

  const preview = (token: string, csv: Buffer, name = "produtos.csv") =>
    request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv, name);

  async function products(organizationId: string) {
    return prisma.withTenant(organizationId, tenant =>
      tenant.product.findMany({
        where: { organizationId },
        orderBy: { code: "asc" },
      })
    );
  }

  it.each(["SELLER", "VIEWER"] as const)(
    "blocks preview and confirm for %s memberships",
    async role => {
      const { token } = await createSession(role, role.toLowerCase());
      const csv = Buffer.from("code,name,unitPrice\nA,Produto,1");

      await preview(token, csv).expect(403);
      await request(app.getHttpServer())
        .post(url("confirm"))
        .set("Authorization", `Bearer ${token}`)
        .field("fingerprint", "0".repeat(64))
        .attach("file", csv, "produtos.csv")
        .expect(403);
    }
  );

  it("isolates existing codes per tenant and ignores deleted products", async () => {
    const tenantA = await createSession("ADMIN", "tenant-a");
    const tenantB = await createSession("MANAGER", "tenant-b");

    await prisma.withTenant(tenantA.organization.id, tenant =>
      tenant.product.createMany({
        data: [
          {
            organizationId: tenantA.organization.id,
            code: "LIC-PBX",
            name: "Licença existente",
            unitPrice: "10.00",
            createdBy: tenantA.user.id,
            updatedBy: tenantA.user.id,
          },
          {
            organizationId: tenantA.organization.id,
            code: "OLD",
            name: "Excluído",
            unitPrice: "1.00",
            deletedAt: new Date(),
            deletedBy: tenantA.user.id,
            createdBy: tenantA.user.id,
            updatedBy: tenantA.user.id,
          },
        ],
      })
    );

    const csv = Buffer.from(
      "code,name,unitPrice\nlic-pbx,Licença,1200.50\nOLD,Reuso,1"
    );

    const inA = await preview(tenantA.token, csv).expect(200);
    expect(inA.body).toMatchObject({ processed: 2, valid: 1, invalid: 1 });
    expect(inA.body.rows[0]?.errors).toContain(
      "Código já cadastrado para outro produto."
    );
    expect(inA.body.rows[1]?.status).toBe("VALID");

    const inB = await preview(tenantB.token, csv).expect(200);
    expect(inB.body).toMatchObject({ processed: 2, valid: 2, invalid: 0 });
    expect(await products(tenantB.organization.id)).toHaveLength(0);
  });

  it("confirms valid rows only, normalizing values, and audits product.created", async () => {
    const { organization, token } = await createSession("MANAGER", "confirm");
    const csv = Buffer.from(
      'code;name;unitPrice;description;isActive\nLIC;Licença PABX;"1200,50";Anual;não\nIMPL;Implantação;2500;;\nlic;Duplicado;1;;\nBAD;Preço inválido;abc;;'
    );

    const previewed = await preview(token, csv).expect(200);
    expect(previewed.body).toMatchObject({
      processed: 4,
      valid: 2,
      invalid: 2,
    });
    expect(await products(organization.id)).toHaveLength(0);

    const result = await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c4-3-2-import-confirm")
      .field("fingerprint", previewed.body.fingerprint as string)
      .attach("file", csv, "produtos.csv")
      .expect(200);

    expect(result.body).toMatchObject({
      processed: 4,
      imported: 2,
      rejected: 2,
    });
    expect(result.body.rows[2]?.errors).toContain(
      "Código duplicado no arquivo de importação."
    );

    const created = await products(organization.id);
    expect(
      created.map(product => ({
        code: product.code,
        name: product.name,
        description: product.description,
        unitPrice: product.unitPrice.toFixed(2),
        isActive: product.isActive,
      }))
    ).toEqual([
      {
        code: "IMPL",
        name: "Implantação",
        description: null,
        unitPrice: "2500.00",
        isActive: true,
      },
      {
        code: "LIC",
        name: "Licença PABX",
        description: "Anual",
        unitPrice: "1200.50",
        isActive: false,
      },
    ]);

    const audit = await prisma.withTenant(organization.id, tenant =>
      tenant.auditLog.findMany({
        where: {
          organizationId: organization.id,
          requestId: "c4-3-2-import-confirm",
        },
        select: { action: true, entityId: true },
      })
    );
    expect(audit.map(entry => entry.action)).toEqual([
      "product.created",
      "product.created",
    ]);
    expect(audit.map(entry => entry.entityId).sort()).toEqual(
      created.map(product => product.id).sort()
    );
  });

  it("returns 400 for invalid CSV, missing file, non-CSV file and mismatched fingerprint", async () => {
    const { organization, token } = await createSession("ADMIN", "validation");
    const csv = Buffer.from("code,name,unitPrice\nA,Produto,1");

    await preview(token, Buffer.from("code,name\nA,Produto")).expect(400);
    await preview(
      token,
      Buffer.from("code,name,unitPrice,sku\nA,B,1,x")
    ).expect(400);
    await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await preview(token, csv, "produtos.txt").expect(400);

    await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv, "produtos.csv")
      .expect(400);

    const previewed = await preview(token, csv).expect(200);
    await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .field("fingerprint", previewed.body.fingerprint as string)
      .attach(
        "file",
        Buffer.from("code,name,unitPrice\nA,Produto alterado,1"),
        "produtos.csv"
      )
      .expect(400);

    expect(await products(organization.id)).toHaveLength(0);
  });
});
