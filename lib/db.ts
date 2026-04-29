import { PrismaClient } from "@prisma/client";

/**
 * Prisma client 单例。
 *
 * Next.js 在 dev 模式下热重载会反复 import 模块，每次 new PrismaClient() 都会
 * 建立新连接，最终触发 PG 连接数上限。沿用 Prisma 官方推荐的 globalThis 缓存。
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
