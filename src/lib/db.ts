import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Geliştirmede sıcak yeniden yükleme her seferinde yeni havuz açmasın.
const g = globalThis as unknown as { __prisma?: PrismaClient };

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const db: PrismaClient = g.__prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") g.__prisma = db;
