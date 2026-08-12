import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "../config/index.js";
import { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Client compartilhado. No Prisma 7 a conexão chega por driver adapter — a URL
 * não vive mais no schema (ver plan 0001).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
