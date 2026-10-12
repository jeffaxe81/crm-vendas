import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("CRM 1.1 first-access onboarding integration", () => {
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
      organizationName: `Onboarding ${suffix}`,
      adminDisplayName: "Founder",
      adminEmail: `onboard-${suffix}@example.test`,
      adminPassword: "Onboarding-test-1234!",
    };
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send(credentials)
      .expect(201);
    return { token: response.body.accessToken as string, credentials };
  }
  const get = (token: string) =>
    request(app.getHttpServer())
      .get("/api/v1/me/onboarding")
      .auth(token, { type: "bearer" });
  const update = (token: string, data: unknown) =>
    request(app.getHttpServer())
      .put("/api/v1/me/onboarding/organization")
      .auth(token, { type: "bearer" })
      .send(data);
  const tour = (token: string, data: unknown) =>
    request(app.getHttpServer())
      .post("/api/v1/me/onboarding/tour")
      .auth(token, { type: "bearer" })
      .send(data);

  it("saves founder wizard per organization, resumes after login, rejects skipping", async () => {
    const first = await register();
    const second = await register();
    const initial = await get(first.token).expect(200);
    expect(initial.body.organization).toMatchObject({
      eligible: true,
      completed: false,
      step: 1,
    });
    expect(initial.body.tour.status).toBe("PENDING");
    await update(first.token, { step: 4, complete: true }).expect(400);
    await update(first.token, { step: 2, name: "Minha Empresa" })
      .expect(200)
      .expect(res => {
        expect(res.body).toMatchObject({
          eligible: true,
          step: 2,
          name: "Minha Empresa",
          completed: false,
        });
      });
    const other = await get(second.token).expect(200);
    expect(other.body.organization.name).toBe(
      second.credentials.organizationName
    );
    expect(other.body.organization.step).toBe(1);
    await update(first.token, {
      step: 3,
      organizationId: randomUUID(),
    }).expect(400);
    const signedIn = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: first.credentials.adminEmail,
        password: first.credentials.adminPassword,
      })
      .expect(200);
    expect(
      (await get(signedIn.body.accessToken).expect(200)).body.organization.step
    ).toBe(2);
    await update(first.token, { step: 3 }).expect(200);
    await update(first.token, { step: 4 }).expect(200);
    await update(first.token, { step: 4, complete: true }).expect(200);
    expect(
      (await get(first.token).expect(200)).body.organization.completed
    ).toBe(true);
  }, 30000);

  it("tour is individual per membership, persists after login, and denies member wizard", async () => {
    const owner = await register();
    const other = await register();
    const suffix = randomUUID();
    const email = `tour-viewer-${suffix}@example.test`;
    const password = "Onboarding-viewer-123!";
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .auth(owner.token, { type: "bearer" })
      .send({ email, password, displayName: "Viewer", role: "VIEWER" })
      .expect(201);
    const member = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    const memberToken = member.body.accessToken as string;
    const before = await get(memberToken).expect(200);
    expect(before.body.organization.eligible).toBe(false);
    expect(before.body.tour.status).toBe("PENDING");
    await update(memberToken, { step: 2, name: "Privilege escalation" }).expect(
      403
    );
    await tour(memberToken, {
      status: "COMPLETED",
      userId: randomUUID(),
    }).expect(400);
    await tour(memberToken, { status: "COMPLETED" }).expect(201);
    await tour(memberToken, { status: "SKIPPED" }).expect(201);
    expect((await get(memberToken).expect(200)).body.tour.status).toBe(
      "COMPLETED"
    );
    expect((await get(owner.token).expect(200)).body.tour.status).toBe(
      "PENDING"
    );
    expect((await get(other.token).expect(200)).body.tour.status).toBe(
      "PENDING"
    );
    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    expect(
      (await get(again.body.accessToken).expect(200)).body.tour.status
    ).toBe("COMPLETED");
  }, 30000);

  it("requires an authenticated user session", async () => {
    await request(app.getHttpServer()).get("/api/v1/me/onboarding").expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/me/onboarding/tour")
      .send({ status: "COMPLETED" })
      .expect(401);
  });
});
