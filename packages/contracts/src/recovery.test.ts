import { expect, it } from "vitest";
import {
  DeleteExecutionRequestSchema,
  RestoreExecutionRequestSchema,
} from "./recovery";

const input = {
  previewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  password: "synthetic-password",
};
it("requires the exact phrase for the selected destructive action", () => {
  expect(
    RestoreExecutionRequestSchema.safeParse({
      ...input,
      confirmation: "RESTAURAR DADOS",
    }).success
  ).toBe(true);
  expect(
    DeleteExecutionRequestSchema.safeParse({
      ...input,
      confirmation: "EXCLUIR DADOS OPERACIONAIS",
    }).success
  ).toBe(true);
  expect(
    DeleteExecutionRequestSchema.safeParse({
      ...input,
      confirmation: "RESTAURAR DADOS",
    }).success
  ).toBe(false);
  expect(
    RestoreExecutionRequestSchema.safeParse({
      ...input,
      confirmation: "RESTAURAR DADOS ",
      force: true,
    }).success
  ).toBe(false);
});
it("rejects missing credentials and injected request fields", () => {
  expect(
    DeleteExecutionRequestSchema.safeParse({
      ...input,
      password: "",
      confirmation: "EXCLUIR DADOS OPERACIONAIS",
    }).success
  ).toBe(false);
  expect(
    DeleteExecutionRequestSchema.safeParse({
      ...input,
      confirmation: "EXCLUIR DADOS OPERACIONAIS",
      organizationId: input.previewId,
    }).success
  ).toBe(false);
});
