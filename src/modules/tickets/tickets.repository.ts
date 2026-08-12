import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TicketStatus } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface TicketWithContext {
  readonly id: string;
  readonly code: string;
  readonly status: TicketStatus;
  readonly usedAt: Date | null;
  readonly seatLabel: string;
  readonly customerId: string;
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly date: Date;
    readonly venue: string;
  };
}

export interface TicketsRepository {
  findByCode(code: string): Promise<TicketWithContext | null>;
  listByCustomer(
    customerId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: readonly TicketWithContext[]; total: number }>;
}

/** O ingresso só faz sentido com evento e assento juntos; buscamos os três. */
const withContext = {
  reservation: {
    select: {
      customerId: true,
      seat: { select: { label: true } },
      event: { select: { id: true, title: true, date: true, venue: true } },
    },
  },
} as const;

interface RawTicket {
  id: string;
  code: string;
  status: TicketStatus;
  usedAt: Date | null;
  reservation: {
    customerId: string;
    seat: { label: string };
    event: { id: string; title: string; date: Date; venue: string };
  };
}

function toTicket(raw: RawTicket): TicketWithContext {
  return {
    id: raw.id,
    code: raw.code,
    status: raw.status,
    usedAt: raw.usedAt,
    seatLabel: raw.reservation.seat.label,
    customerId: raw.reservation.customerId,
    event: raw.reservation.event,
  };
}

export function createTicketsRepository(
  prisma: PrismaClient = sharedPrisma,
): TicketsRepository {
  return {
    async findByCode(code) {
      const ticket = await prisma.ticket.findUnique({
        where: { code },
        include: withContext,
      });

      return ticket ? toTicket(ticket) : null;
    },

    async listByCustomer(customerId, pagination) {
      const where = { reservation: { customerId } };

      const [items, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: withContext,
          orderBy: { createdAt: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.ticket.count({ where }),
      ]);

      return { items: items.map(toTicket), total };
    },
  };
}
