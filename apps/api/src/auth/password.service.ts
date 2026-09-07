import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
} as const;

@Injectable()
export class PasswordService {
  private readonly dummyHashPromise = argon2.hash(
    "axes-crm-invalid-credential-placeholder",
    ARGON2_OPTIONS
  );

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    const dummyHash = await this.dummyHashPromise;
    await argon2.verify(dummyHash, password);
  }
}
