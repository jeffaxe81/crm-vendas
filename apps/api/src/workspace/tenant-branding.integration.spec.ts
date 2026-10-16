import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { defaultBranding } from "@axes/contracts";
import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Tenant branding HTTP and database isolation", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  async function register() {
    const suffix = randomUUID();
    const credentials = {
      organizationName: `Branding ${suffix}`,
      adminDisplayName: "Admin",
      adminEmail: `branding-${suffix}@example.test`,
      adminPassword: "Branding-password-2026!",
    };
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send(credentials)
      .expect(201);
    return { ...res.body, credentials };
  }
  const read = (token: string) =>
    request(app.getHttpServer())
      .get("/api/v1/organization/branding")
      .auth(token, { type: "bearer" });
  const save = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put("/api/v1/organization/branding")
      .auth(token, { type: "bearer" })
      .send(body);
  it("persists across login, isolates tenants and rejects unauthorized edits", async () => {
    const a = await register();
    const b = await register();
    expect((await read(a.accessToken).expect(200)).body).toEqual(
      defaultBranding
    );
    const chosen = {
      ...defaultBranding,
      primaryColor: "#aa2244",
      menuColor: "#142434",
    };
    await save(a.accessToken, chosen).expect(200);
    expect((await read(b.accessToken).expect(200)).body).toEqual(
      defaultBranding
    );
    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: a.credentials.adminEmail,
        password: a.credentials.adminPassword,
      })
      .expect(200);
    expect((await read(again.body.accessToken).expect(200)).body).toEqual(
      chosen
    );
    await save(a.accessToken, {
      ...chosen,
      organizationId: b.organization.id,
    }).expect(400);
    const email = `branding-viewer-${randomUUID()}@example.test`;
    const password = "Viewer-password-2026!";
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .auth(a.accessToken, { type: "bearer" })
      .send({ email, password, displayName: "Viewer", role: "VIEWER" })
      .expect(201);
    const viewer = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    expect((await read(viewer.body.accessToken).expect(200)).body).toEqual(
      chosen
    );
    await save(viewer.body.accessToken, defaultBranding).expect(403);
    await save(a.accessToken, defaultBranding).expect(200);
    expect((await read(a.accessToken).expect(200)).body).toEqual(
      defaultBranding
    );
  }, 30000);
  it("requires authentication", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/organization/branding")
      .expect(401);
    await request(app.getHttpServer())
      .put("/api/v1/organization/branding")
      .send(defaultBranding)
      .expect(401);
  });
});
