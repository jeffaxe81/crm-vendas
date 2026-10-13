import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";

import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("CRM 1.2 quick setup integration", () => {
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
      organizationName: `Quick Setup ${suffix}`,
      adminDisplayName: "Founder",
      adminEmail: `quick-${suffix}@example.test`,
      adminPassword: ["synthetic", "quick", "setup", "123!"].join("-"),
    };
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send(credentials)
      .expect(201);
    return { token: response.body.accessToken as string, credentials };
  }

  const getState = (token: string) =>
    request(app.getHttpServer())
      .get("/api/v1/me/quick-setup")
      .auth(token, { type: "bearer" });

  const progress = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post("/api/v1/me/quick-setup/progress")
      .auth(token, { type: "bearer" })
      .send(body);

  const reopen = (token: string) =>
    request(app.getHttpServer())
      .post("/api/v1/me/quick-setup/reopen")
      .auth(token, { type: "bearer" });

  it(
    "derives admin steps from permissions and resumes progress after login",
    async () => {
      const owner = await register();

      const initial = await getState(owner.token).expect(200);
      expect(initial.body).toMatchObject({
        completed: false,
        completedSteps: [],
      });
      expect(initial.body.steps.map((step: { id: string }) => step.id)).toEqual([
        "organization",
        "team",
        "sales-structure",
        "commercial-data",
        "help",
        "review",
      ]);

      await progress(owner.token, { stepId: "organization" }).expect(201);
      await progress(owner.token, { stepId: "team" }).expect(201);

      const signedIn = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: owner.credentials.adminEmail,
          password: owner.credentials.adminPassword,
        })
        .expect(200);

      const resumed = await getState(signedIn.body.accessToken).expect(200);
      expect(resumed.body.completedSteps).toEqual(["organization", "team"]);
    }
  );

  it(
    "shows only safe steps to VIEWER and rejects unauthorized progress",
    async () => {
      const owner = await register();
      const suffix = randomUUID();
      const email = `viewer-${suffix}@example.test`;
      const password = ["synthetic", "viewer", "quick", "123!"].join("-");

      await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .auth(owner.token, { type: "bearer" })
        .send({ email, password, displayName: "Viewer", role: "VIEWER" })
        .expect(201);

      const member = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password })
        .expect(200);

      const state = await getState(member.body.accessToken).expect(200);
      expect(state.body.steps.map((step: { id: string }) => step.id)).toEqual([
        "help",
        "review",
      ]);

      await progress(member.body.accessToken, { stepId: "team" }).expect(403);
      await progress(member.body.accessToken, { stepId: "help" }).expect(201);
    }
  );

  it("keeps progress isolated per organization", async () => {
    const first = await register();
    const second = await register();

    await progress(first.token, { stepId: "organization" }).expect(201);

    expect(
      (await getState(first.token).expect(200)).body.completedSteps
    ).toEqual(["organization"]);
    expect(
      (await getState(second.token).expect(200)).body.completedSteps
    ).toEqual([]);
  });

  it("completes at review and can be explicitly reopened", async () => {
    const owner = await register();

    for (const stepId of [
      "organization",
      "team",
      "sales-structure",
      "commercial-data",
      "help",
    ]) {
      await progress(owner.token, { stepId }).expect(201);
    }

    await progress(owner.token, {
      stepId: "review",
      complete: true,
    }).expect(201);
    expect((await getState(owner.token).expect(200)).body.completed).toBe(true);

    const reopened = await reopen(owner.token).expect(201);
    expect(reopened.body).toMatchObject({
      completed: false,
      completedSteps: [],
    });
  });

  it("requires an authenticated user session", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/me/quick-setup")
      .expect(401);
  });
});
