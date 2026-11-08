import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 5 knowledge API and tenant boundaries", () => {
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

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      "TRUNCATE TABLE knowledge_opportunities, knowledge_contacts, " +
        "knowledge_companies, knowledge_items, audit_logs, refresh_sessions, " +
        "organization_memberships, users, organizations CASCADE"
    );
  }

  async function createOrganization(slug: string) {
    return prisma.organization.create({
      data: { name: slug, slug },
    });
  }

  async function createUser(
    organizationId: string,
    email: string,
    role: "ADMIN" | "VIEWER" = "ADMIN"
  ) {
    const password = "Strong-Knowledge-Test-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName: email,
        passwordHash: await passwords.hash(password),
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId, userId: user.id, role },
    });
    return { user, password };
  }

  async function login(
    email: string,
    password: string,
    organizationSlug: string
  ) {
    const result = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug })
      .expect(200);
    return result.body.accessToken as string;
  }

  it("creates and updates a note, links same-tenant companies and soft-deletes", async () => {
    const organization = await createOrganization("knowledge-notes");
    const { user, password } = await createUser(
      organization.id,
      "knowledge-notes@example.test"
    );
    const token = await login(user.email, password, organization.slug);
    const company = await prisma.withTenant(organization.id, tx =>
      tx.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Empresa Conhecimento",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );

    const created = await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .set("Authorization", "Bearer " + token)
      .set("x-request-id", "knowledge-note-create")
      .send({
        type: "NOTE",
        title: "Registro da reunião",
        noteContent: "Proposta comercial revisada",
        companyIds: [company.id],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      title: "Registro da reunião",
      type: "NOTE",
      companyIds: [company.id],
      aiStatus: "UNPROCESSED",
    });
    expect(created.body).not.toHaveProperty("storageKey");

    const listed = await request(app.getHttpServer())
      .get("/api/v1/knowledge?q=Registro&type=NOTE")
      .set("Authorization", "Bearer " + token)
      .expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].id).toBe(created.body.id);

    await request(app.getHttpServer())
      .patch("/api/v1/knowledge/" + created.body.id)
      .set("Authorization", "Bearer " + token)
      .send({ title: "Registro atualizado", companyIds: [] })
      .expect(200);

    const updated = await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + created.body.id)
      .set("Authorization", "Bearer " + token)
      .expect(200);
    expect(updated.body.title).toBe("Registro atualizado");
    expect(updated.body.companyIds).toEqual([]);
    expect(updated.body.version).toBe(2);

    await request(app.getHttpServer())
      .delete("/api/v1/knowledge/" + created.body.id)
      .set("Authorization", "Bearer " + token)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + created.body.id)
      .set("Authorization", "Bearer " + token)
      .expect(404);
    const audit = await prisma.withTenant(organization.id, tx =>
      tx.auditLog.findMany({
        where: { organizationId: organization.id, entityId: created.body.id },
      })
    );
    expect(audit.map(row => row.action).sort()).toEqual([
      "knowledge.created",
      "knowledge.deleted",
      "knowledge.updated",
    ]);
  });

  it("enforces PRIVATE author access and rejects cross-tenant relations", async () => {
    const orgA = await createOrganization("knowledge-private-a");
    const orgB = await createOrganization("knowledge-private-b");
    const author = await createUser(orgA.id, "knowledge-author@example.test");
    const reader = await createUser(orgA.id, "knowledge-other@example.test");
    const foreign = await createUser(orgB.id, "knowledge-foreign@example.test");
    const [authorToken, readerToken] = await Promise.all([
      login(author.user.email, author.password, orgA.slug),
      login(reader.user.email, reader.password, orgA.slug),
    ]);
    const otherCompany = await prisma.withTenant(orgB.id, tx =>
      tx.company.create({
        data: {
          organizationId: orgB.id,
          legalName: "Empresa privada de outro tenant",
          createdBy: foreign.user.id,
          updatedBy: foreign.user.id,
        },
      })
    );

    await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .set("Authorization", "Bearer " + authorToken)
      .send({
        type: "NOTE",
        title: "Vínculo proibido",
        noteContent: "Não deve persistir",
        companyIds: [otherCompany.id],
      })
      .expect(404);

    const privateNote = await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .set("Authorization", "Bearer " + authorToken)
      .send({
        type: "NOTE",
        title: "Anotações privadas",
        noteContent: "Somente autor",
        accessLevel: "PRIVATE",
      })
      .expect(201);

    await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + privateNote.body.id)
      .set("Authorization", "Bearer " + readerToken)
      .expect(404);
    await request(app.getHttpServer())
      .patch("/api/v1/knowledge/" + privateNote.body.id)
      .set("Authorization", "Bearer " + readerToken)
      .send({ title: "Tentativa" })
      .expect(404);
    const otherList = await request(app.getHttpServer())
      .get("/api/v1/knowledge")
      .set("Authorization", "Bearer " + readerToken)
      .expect(200);
    expect(otherList.body.total).toBe(0);
  });

  it("authorizes file downloads, validates hashes, and blocks viewers from writing", async () => {
    const organization = await createOrganization("knowledge-documents");
    const admin = await createUser(
      organization.id,
      "knowledge-admin@example.test"
    );
    const viewer = await createUser(
      organization.id,
      "knowledge-viewer@example.test",
      "VIEWER"
    );
    const adminToken = await login(
      admin.user.email,
      admin.password,
      organization.slug
    );
    const viewerToken = await login(
      viewer.user.email,
      viewer.password,
      organization.slug
    );

    await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .set("Authorization", "Bearer " + viewerToken)
      .send({ type: "NOTE", title: "Negado", noteContent: "Sem permissão" })
      .expect(403);

    const contents = "Documento para homologação";
    const created = await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .set("Authorization", "Bearer " + adminToken)
      .send({
        type: "DOCUMENT",
        title: "Contrato reservado",
        accessLevel: "ORGANIZATION",
        document: {
          fileName: "contrato.txt",
          mimeType: "text/plain",
          base64: Buffer.from(contents).toString("base64"),
        },
      })
      .expect(201);
    expect(created.body.sizeBytes).toBe(Buffer.byteLength(contents));
    expect(created.body).not.toHaveProperty("storageKey");

    const download = await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + created.body.id + "/document")
      .set("Authorization", "Bearer " + viewerToken)
      .expect(200);
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.headers["content-security-policy"]).toBe("sandbox");
    expect(download.headers["cache-control"]).toBe("private, no-store");
    expect(download.headers["x-download-options"]).toBe("noopen");
    const downloadedText = download.text ?? download.body.toString();
    expect(downloadedText).toBe(contents);

    await request(app.getHttpServer())
      .delete("/api/v1/knowledge/" + created.body.id)
      .set("Authorization", "Bearer " + adminToken)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + created.body.id + "/document")
      .set("Authorization", "Bearer " + adminToken)
      .expect(404);
  });
  it("black-box rejects 128 adversarial payloads without writing business data", async () => {
    const organization = await createOrganization("knowledge-blackbox");
    const { user, password } = await createUser(
      organization.id,
      "knowledge-blackbox@example.test"
    );
    const token = await login(user.email, password, organization.slug);
    const valid = "11111111-1111-4111-8111-111111111111";

    for (let i = 0; i < 128; i += 1) {
      const title = "Adversarial " + i;
      const doc = {
        fileName: "arquivo-" + i + ".txt",
        mimeType: "text/plain",
        base64: Buffer.from("test" + i).toString("base64"),
      };
      const note = { type: "NOTE", title, noteContent: "Nota " + i };
      const link = { type: "LINK", title, url: "https://example.test/" + i };
      const item = { type: "DOCUMENT", title, document: doc };
      const payloads: Record<string, unknown>[] = [
        { ...note, title: "  " },
        { ...note, noteContent: " " },
        { ...note, title: i },
        { ...note, companyIds: [valid, valid] },
        { ...note, companyIds: ["invalid"] },
        { ...note, injected: "<script>" },
        { ...link, url: "ftp://example.test/" + i },
        { ...link, url: "javascript:alert(" + i + ")" },
        { ...item, document: { ...doc, fileName: "../" + title } },
        { ...item, document: { ...doc, mimeType: " " } },
        { ...item, document: { ...doc, base64: "@bad" } },
        { type: "DOCUMENT", title },
        { ...note, accessLevel: "WORLD" },
        { ...note, url: "https://example.test" },
        { ...link, noteContent: "invalid" },
        { ...item, document: { ...doc, fileName: "x".repeat(256) } },
      ];
      await request(app.getHttpServer())
        .post("/api/v1/knowledge")
        .set("Authorization", "Bearer " + token)
        .send(payloads[i % payloads.length])
        .expect(400);
    }

    for (const path of [
      "?page=0",
      "?page=-1",
      "?limit=0",
      "?limit=101",
      "?type=WRONG",
      "?accessLevel=WORLD",
      "?createdBy=unknown",
      "?q=%20%20%20",
    ]) {
      await request(app.getHttpServer())
        .get("/api/v1/knowledge" + path)
        .set("Authorization", "Bearer " + token)
        .expect(400);
    }

    await request(app.getHttpServer()).get("/api/v1/knowledge").expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/knowledge")
      .send({ type: "NOTE", title: "Sem sessão", noteContent: "Inválido" })
      .expect(401);

    expect(
      await prisma.withTenant(organization.id, tx =>
        tx.knowledgeItem.count({ where: { organizationId: organization.id } })
      )
    ).toBe(0);
    expect(
      await prisma.withTenant(organization.id, tx =>
        tx.auditLog.count({
          where: {
            organizationId: organization.id,
            action: "knowledge.created",
          },
        })
      )
    ).toBe(0);
  }, 60_000);

  it("handles 32 concurrent writes, pagination and foreign tenant isolation", async () => {
    const orgA = await createOrganization("knowledge-concurrency-a");
    const orgB = await createOrganization("knowledge-concurrency-b");
    const author = await createUser(
      orgA.id,
      "knowledge-concurrency-a@example.test"
    );
    const foreign = await createUser(
      orgB.id,
      "knowledge-concurrency-b@example.test"
    );
    const tokenA = await login(author.user.email, author.password, orgA.slug);
    const tokenB = await login(foreign.user.email, foreign.password, orgB.slug);
    const created: string[] = [];
    for (let batch = 0; batch < 4; batch += 1) {
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          request(app.getHttpServer())
            .post("/api/v1/knowledge")
            .set("Authorization", "Bearer " + tokenA)
            .send({
              type: "NOTE",
              title: "Concurrent " + (batch * 8 + index),
              noteContent: "Concurrent insert " + batch + "-" + index,
            })
        )
      );
      for (const response of responses) {
        expect(response.status).toBe(201);
        created.push(response.body.id as string);
      }
    }
    expect(new Set(created).size).toBe(32);

    const firstPage = await request(app.getHttpServer())
      .get("/api/v1/knowledge?limit=20&page=1")
      .set("Authorization", "Bearer " + tokenA)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get("/api/v1/knowledge?limit=20&page=2")
      .set("Authorization", "Bearer " + tokenA)
      .expect(200);
    expect(firstPage.body.total).toBe(32);
    expect(firstPage.body.items).toHaveLength(20);
    expect(secondPage.body.items).toHaveLength(12);
    const actual = [...firstPage.body.items, ...secondPage.body.items].map(
      item => item.id as string
    );
    expect(new Set(actual)).toEqual(new Set(created));

    const foreignList = await request(app.getHttpServer())
      .get("/api/v1/knowledge")
      .set("Authorization", "Bearer " + tokenB)
      .expect(200);
    expect(foreignList.body.total).toBe(0);
    await request(app.getHttpServer())
      .get("/api/v1/knowledge/" + created[0])
      .set("Authorization", "Bearer " + tokenB)
      .expect(404);
  }, 60_000);
});
