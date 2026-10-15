import { expect, it } from "vitest";
import {
  BackupRecordSchema,
  DataOperationStateSchema,
} from "./data-management";

it.each(["DELETING", "DELETED"])(
  "accepts backup state %s without treating it as an operation state",
  state => {
    const row = BackupRecordSchema.parse({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      actorUserId: null,
      reason: "MANUAL",
      state,
      schemaVersion: 1,
      checksum: "a".repeat(64),
      byteCount: 10,
      counts: {},
      errorCode: null,
      createdAt: "2026-10-15T12:00:00.000Z",
      completedAt: "2026-10-15T12:00:01.000Z",
    });
    expect(row.state).toBe(state);
    expect(DataOperationStateSchema.safeParse(state).success).toBe(false);
  }
);
