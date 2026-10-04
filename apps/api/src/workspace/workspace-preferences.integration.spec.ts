import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createDefaultWorkspacePreferences } from "@axes/contracts";
import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Workspace preferences real database integration", () => {
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
  async function account() {
    const suffix = randomUUID();
    const body = {
      organizationName: `Workspace ${suffix}`,
      adminDisplayName: "Workspace admin",
      adminEmail: `workspace-${suffix}@example.test`,
      adminPassword: "Workspace-test-12345!",
    };
    const result = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send(body)
      .expect(201);
    return { ...result.body, credentials: body };
  }
  it("persists across sessions and isolates two organizations and users", async () => {
    const first = await account();
    const second = await account();
    const defaults = createDefaultWorkspacePreferences();
    const input = {
      ...defaults,
      defaultSection: "companies",
      favorites: ["companies"],
      homeHidden: ["today"],
    };
    await request(app.getHttpServer())
      .put("/api/v1/me/workspace-preferences")
      .auth(first.accessToken, { type: "bearer" })
      .send(input)
      .expect(200, input);
    await request(app.getHttpServer())
      .get("/api/v1/me/workspace-preferences")
      .auth(second.accessToken, { type: "bearer" })
      .expect(200, defaults);
    const suffix = randomUUID();
    const email = `member-${suffix}@example.test`;
    const password = "Workspace-member-12345!";
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .auth(first.accessToken, { type: "bearer" })
      .send({ email, password, displayName: "Second member", role: "VIEWER" })
      .expect(201);
    const member = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/v1/me/workspace-preferences")
      .auth(member.body.accessToken, { type: "bearer" })
      .expect(200, defaults);
    const relogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: first.credentials.adminEmail,
        password: first.credentials.adminPassword,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/v1/me/workspace-preferences")
      .auth(relogin.body.accessToken, { type: "bearer" })
      .expect(200, input);
  });
  it("rejects identity supplied in a body and unauthenticated reads", async () => {
    const user = await account();
    await request(app.getHttpServer())
      .get("/api/v1/me/workspace-preferences")
      .expect(401);
    await request(app.getHttpServer())
      .put("/api/v1/me/workspace-preferences")
      .auth(user.accessToken, { type: "bearer" })
      .send({ ...createDefaultWorkspacePreferences(), userId: randomUUID() })
      .expect(400);
  });
});
