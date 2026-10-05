import type { PrismaService } from "../database/prisma.service";

export class BackupScheduleService {
  constructor(private readonly prisma: PrismaService) {}
  async enqueueDue(_now: Date = new Date()): Promise<number> {
    throw new Error("NOT_IMPLEMENTED");
  }
}
