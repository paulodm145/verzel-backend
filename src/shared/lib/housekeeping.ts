import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma as sharedPrisma } from "./prisma.js";
import { getLogger } from "./logger.js";

export interface HousekeepingResult {
  readonly expiredReservations: number;
  readonly deletedRefreshTokens: number;
}

/** Tokens revogados ou vencidos há mais de uma semana já não servem a nada. */
const REFRESH_TOKEN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Higiene periódica do banco.
 *
 * Nada aqui é necessário para a **correção** do sistema: pagar reserva vencida
 * já é recusado, e token revogado já não renova. O que a varredura resolve é o
 * acúmulo — reserva vencida em assento que ninguém disputa nunca era expirada
 * pela verificação preguiçosa, e ficava contando como ocupação, fazendo o
 * evento parecer mais cheio do que está.
 *
 * A expiração preguiçosa da reserva continua onde estava: é ela que garante
 * correção no instante da disputa. Esta varredura é limpeza, não garantia.
 */
export async function runHousekeeping(
  prisma: PrismaClient = sharedPrisma,
): Promise<HousekeepingResult> {
  const now = new Date();

  const { count: expiredReservations } = await prisma.reservation.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const { count: deletedRefreshTokens } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date(now.getTime() - REFRESH_TOKEN_GRACE_MS) } },
        {
          revokedAt: {
            lte: new Date(now.getTime() - REFRESH_TOKEN_GRACE_MS),
          },
        },
      ],
    },
  });

  return { expiredReservations, deletedRefreshTokens };
}

/**
 * Agenda a varredura enquanto o processo viver.
 *
 * `unref` de propósito: uma tarefa de limpeza não pode segurar o desligamento
 * do servidor, que tem prazo próprio para encerrar.
 */
export function scheduleHousekeeping(intervalMs: number): NodeJS.Timeout {
  const timer = setInterval(() => {
    void runHousekeeping()
      .then((result) => {
        if (result.expiredReservations > 0 || result.deletedRefreshTokens > 0) {
          getLogger().info(result, "limpeza periódica concluída");
        }
      })
      .catch((error: unknown) => {
        getLogger().warn({ err: error }, "limpeza periódica falhou");
      });
  }, intervalMs);

  timer.unref();

  return timer;
}
