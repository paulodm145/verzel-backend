import type { PrismaClient } from "../../generated/prisma/client.js";
import type { EventStatus, TicketStatus } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface GateTicket {
  readonly id: string;
  readonly code: string;
  readonly status: TicketStatus;
  readonly usedAt: Date | null;
  readonly seatLabel: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventStatus: EventStatus;
}

export interface GateRepository {
  findByCode(code: string): Promise<GateTicket | null>;
  /**
   * Marca o ingresso como usado **e** devolve se a marcação foi desta chamada.
   * `false` significa que outro portão chegou primeiro.
   */
  markAsUsed(ticketId: string, gateUserId: string): Promise<boolean>;
}

export function createGateRepository(
  prisma: PrismaClient = sharedPrisma,
): GateRepository {
  return {
    async findByCode(code) {
      const ticket = await prisma.ticket.findUnique({
        where: { code },
        include: {
          reservation: {
            select: {
              seat: { select: { label: true } },
              event: { select: { id: true, title: true, status: true } },
            },
          },
        },
      });

      if (!ticket) {
        return null;
      }

      return {
        id: ticket.id,
        code: ticket.code,
        status: ticket.status,
        usedAt: ticket.usedAt,
        seatLabel: ticket.reservation.seat.label,
        eventId: ticket.reservation.event.id,
        eventTitle: ticket.reservation.event.title,
        eventStatus: ticket.reservation.event.status,
      };
    },

    /**
     * A checagem e a escrita são a mesma operação: o `where` inclui
     * `status: "VALID"`, e o banco informa quantas linhas mudaram. Zero
     * significa que alguém validou entre a leitura e a escrita — que é
     * exatamente o cenário de dois portões (RN-3, RN-4).
     *
     * Ler o status para depois gravá-lo deixaria uma janela entre as duas
     * operações, e dois leitores em processos diferentes cairiam nela.
     */
    async markAsUsed(ticketId, gateUserId) {
      const { count } = await prisma.ticket.updateMany({
        where: { id: ticketId, status: "VALID" },
        data: {
          status: "USED",
          usedAt: new Date(),
          usedByGateUserId: gateUserId,
        },
      });

      return count === 1;
    },
  };
}
