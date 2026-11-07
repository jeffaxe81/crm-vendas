import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";

test("knowledge black-box isolates tenants, private documents and permissions", async ({
  request,
}) => {
  const id = randomUUID();
  const password = "Knowledge-BlackBox-E2E-2026!";
  async function register(suffix: string) {
    const response = await request.post(api + "/auth/register", {
      data: {
        organizationName: "Knowledge " + suffix + " " + id,
        adminDisplayName: "QA " + suffix,
        adminEmail: "knowledge-blackbox-" + suffix + "-" + id + "@example.test",
        adminPassword: password,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const session = (await response.json()) as { accessToken: string };
    return { Authorization: "Bearer " + session.accessToken };
  }

  const a = await register("a");
  const b = await register("b");
  const privateNote = await request.post(api + "/knowledge", {
    headers: a,
    data: {
      type: "NOTE",
      title: "Tenant A private " + id,
      noteContent: "Never visible in tenant B",
      accessLevel: "PRIVATE",
    },
  });
  expect(privateNote.status(), await privateNote.text()).toBe(201);
  const note = (await privateNote.json()) as { id: string };
  const foreignRead = await request.get(api + "/knowledge/" + note.id, {
    headers: b,
  });
  expect(foreignRead.status()).toBe(404);
  const foreignPatch = await request.patch(api + "/knowledge/" + note.id, {
    headers: b,
    data: { title: "Forbidden rewrite" },
  });
  expect(foreignPatch.status()).toBe(404);
  const foreignDelete = await request.delete(api + "/knowledge/" + note.id, {
    headers: b,
  });
  expect(foreignDelete.status()).toBe(404);

  const contents = Buffer.from("Evidence from tenant A: " + id);
  const upload = await request.post(api + "/knowledge", {
    headers: a,
    data: {
      type: "DOCUMENT",
      title: "Tenant A confidential " + id,
      accessLevel: "PRIVATE",
      document: {
        fileName: "tenant-evidence.txt",
        mimeType: "text/plain",
        base64: contents.toString("base64"),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const doc = (await upload.json()) as { id: string };
  const blocked = await request.get(
    api + "/knowledge/" + doc.id + "/document",
    { headers: b }
  );
  expect(blocked.status()).toBe(404);

  const read = await request.get(api + "/knowledge/" + doc.id + "/document", {
    headers: a,
  });
  expect(read.status()).toBe(200);
  expect(read.headers()["content-disposition"]).toContain("attachment");
  expect(read.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await read.body()).toEqual(contents);

  const otherList = await request.get(api + "/knowledge", { headers: b });
  expect(otherList.status()).toBe(200);
  const foreign = (await otherList.json()) as { total: number };
  expect(foreign.total).toBe(0);

  const invalidUpload = await request.post(api + "/knowledge", {
    headers: a,
    data: {
      type: "DOCUMENT",
      title: "Invalid " + id,
      document: {
        fileName: "../escape.txt",
        mimeType: "text/plain",
        base64: contents.toString("base64"),
      },
    },
  });
  expect(invalidUpload.status()).toBe(400);
  const anonymousList = await request.get(api + "/knowledge");
  expect(anonymousList.status()).toBe(401);
});
