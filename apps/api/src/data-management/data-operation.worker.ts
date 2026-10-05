import type { PrismaService } from "../database/prisma.service";
import type { DataOperation } from "../generated/prisma/client";

export class DataOperationWorker {
  constructor(private readonly prisma: PrismaService) {}
  async claimNext(_workerId: string): Promise<DataOperation | null> {
    throw new Error("NOT_IMPLEMENTED");
  }
  async heartbeat(_job: DataOperation): Promise<boolean> {
    throw new Error("NOT_IMPLEMENTED");
  }
  async finish(_job: DataOperation): Promise<boolean> {
    throw new Error("NOT_IMPLEMENTED");
  }
}
