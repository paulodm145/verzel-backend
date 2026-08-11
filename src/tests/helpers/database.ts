import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Client apontado para o banco de teste. Falha alto se `TEST_DATABASE_URL` não
 * estiver definida: teste de integração que silenciosamente cai no banco de
 * desenvolvimento é pior que teste que não roda.
 */
export function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.TEST_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Os testes de integração exigem um banco " +
        "separado — ver .env.example.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Limpa as tabelas na ordem inversa das dependências. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Ticket", "Payment", "Reservation", "Seat", "Event", "User" RESTART IDENTITY CASCADE',
  );
}
