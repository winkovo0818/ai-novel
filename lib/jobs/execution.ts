import type { BackgroundJob, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface JobExecution {
  signal: AbortSignal;
  /** Inside a write transaction, this locks the lease until that write commits. */
  assertActive(tx?: Prisma.TransactionClient): Promise<void>;
}

export function createJobExecution(job: BackgroundJob, signal: AbortSignal): JobExecution {
  return {
    signal,
    async assertActive(tx = prisma) {
      signal.throwIfAborted();
      const result = await tx.backgroundJob.updateMany({
        where: { id: job.id, status: "running", started_at: job.started_at },
        data: { updated_at: new Date() },
      });
      if (!result.count) throw new Error("Job lease has expired or was replaced");
      signal.throwIfAborted();
    },
  };
}
