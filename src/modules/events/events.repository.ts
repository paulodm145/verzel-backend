import type { PrismaClient } from "../../generated/prisma/client.js";
import type { EventStatus, SourceType } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface EventRecord {
  readonly id: string;
  readonly organizerId: string;
  readonly sourceType: SourceType;
  readonly externalId: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly date: Date;
  readonly venue: string;
  readonly capacity: number;
  readonly price: unknown;
  readonly status: EventStatus;
  readonly createdAt: Date;
}

export interface NewEvent {
  readonly organizerId: string;
  readonly sourceType: SourceType;
  readonly externalId: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly date: Date;
  readonly venue: string;
  readonly capacity: number;
  readonly price: number;
}

export interface EventChanges {
  readonly title?: string;
  readonly description?: string | null;
  readonly imageUrl?: string | null;
  readonly date?: Date;
  readonly venue?: string;
  readonly capacity?: number;
  readonly price?: number;
  readonly status?: EventStatus;
}

export interface ListFilter {
  readonly search?: string | undefined;
  readonly skip: number;
  readonly take: number;
  readonly organizerId?: string | undefined;
  readonly status?: EventStatus | undefined;
}

export interface EventPage {
  readonly items: readonly EventRecord[];
  readonly total: number;
}

export interface EventsRepository {
  create(event: NewEvent): Promise<EventRecord>;
  findById(id: string): Promise<EventRecord | null>;
  update(id: string, changes: EventChanges): Promise<EventRecord>;
  /** Troca o mapa inteiro; só faz sentido em rascunho (RN-8). */
  replaceSeats(eventId: string, capacity: number): Promise<void>;
  /**
   * Altera o evento e regenera o mapa **na mesma transação**. Em duas escritas
   * separadas, uma falha no meio deixaria a capacidade divergindo do número de
   * assentos, e o evento anunciaria lugares que não existem.
   */
  updateWithSeats(
    id: string,
    changes: EventChanges,
    capacity: number,
  ): Promise<EventRecord>;
  list(filter: ListFilter): Promise<EventPage>;
  countAvailableSeats(eventId: string): Promise<number>;
  listSeats(eventId: string): Promise<readonly SeatAvailability[]>;
}

export interface SeatAvailability {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
}

/**
 * Rótulos previsíveis e ordenáveis: A1…A20, B1…B20. Vinte por fileira porque é
 * o que cabe numa linha de mapa na interface sem quebrar.
 */
export function seatLabelsFor(capacity: number): string[] {
  const perRow = 20;

  return Array.from({ length: capacity }, (_unused, index) => {
    const row = String.fromCharCode(65 + Math.floor(index / perRow));

    return `${row}${String((index % perRow) + 1)}`;
  });
}

export function createEventsRepository(
  prisma: PrismaClient = sharedPrisma,
): EventsRepository {
  function seatRows(eventId: string, capacity: number) {
    return seatLabelsFor(capacity).map((label) => ({ eventId, label }));
  }

  return {
    /**
     * Evento e mapa de assentos nascem juntos, na mesma transação: sem isso
     * existiria um instante com evento sem assento, e uma falha no meio
     * deixaria um evento impossível de reservar (RN-7).
     */
    async create(event) {
      return prisma.$transaction(async (transaction) => {
        const created = await transaction.event.create({
          data: {
            organizerId: event.organizerId,
            sourceType: event.sourceType,
            externalId: event.externalId,
            title: event.title,
            description: event.description,
            imageUrl: event.imageUrl,
            date: event.date,
            venue: event.venue,
            capacity: event.capacity,
            price: event.price,
          },
        });

        await transaction.seat.createMany({
          data: seatRows(created.id, event.capacity),
        });

        return created;
      });
    },

    findById(id) {
      return prisma.event.findUnique({ where: { id } });
    },

    update(id, changes) {
      return prisma.event.update({ where: { id }, data: changes });
    },

    async replaceSeats(eventId, capacity) {
      await prisma.$transaction([
        prisma.seat.deleteMany({ where: { eventId } }),
        prisma.seat.createMany({ data: seatRows(eventId, capacity) }),
      ]);
    },

    async updateWithSeats(id, changes, capacity) {
      const [updated] = await prisma.$transaction([
        prisma.event.update({ where: { id }, data: changes }),
        prisma.seat.deleteMany({ where: { eventId: id } }),
        prisma.seat.createMany({ data: seatRows(id, capacity) }),
      ]);

      return updated;
    },

    async list(filter) {
      const where = {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.organizerId ? { organizerId: filter.organizerId } : {}),
        ...(filter.search
          ? { title: { contains: filter.search, mode: "insensitive" as const } }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: { date: "asc" },
          skip: filter.skip,
          take: filter.take,
        }),
        prisma.event.count({ where }),
      ]);

      return { items, total };
    },

    /**
     * Assento disponível é o que não tem reserva ativa — não há coluna de
     * estado em `Seat`, por decisão do ADR 0002: duas fontes de verdade sobre o
     * mesmo fato divergem.
     */
    countAvailableSeats(eventId) {
      return prisma.seat.count({
        where: {
          eventId,
          reservations: {
            none: { status: { in: ["PENDING", "CONFIRMED"] } },
          },
        },
      });
    },

    /**
     * Mapa completo do evento, com a disponibilidade de cada assento.
     *
     * Uma consulta só, trazendo junto se existe reserva ativa: buscar os
     * assentos e depois perguntar por cada um seria N+1 num endpoint que a tela
     * de compra chama o tempo todo.
     */
    async listSeats(eventId) {
      const seats = await prisma.seat.findMany({
        where: { eventId },
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          reservations: {
            where: { status: { in: ["PENDING", "CONFIRMED"] } },
            select: { id: true },
            take: 1,
          },
        },
      });

      return seats.map((seat) => ({
        id: seat.id,
        label: seat.label,
        available: seat.reservations.length === 0,
      }));
    },
  };
}
