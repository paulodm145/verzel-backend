import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ReservationStatus } from "../../generated/prisma/enums.js";
import { ConflictError } from "../../shared/errors/index.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface ReservationRecord {
  readonly id: string;
  readonly eventId: string;
  readonly customerId: string;
  readonly seatId: string;
  readonly status: ReservationStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface SeatRecord {
  readonly id: string;
  readonly eventId: string;
  readonly label: string;
}

export interface EventStateRecord {
  readonly id: string;
  readonly status: string;
}

export interface NewReservation {
  readonly eventId: string;
  readonly customerId: string;
  readonly seatId: string;
  readonly expiresAt: Date;
}

export interface ReservationsRepository {
  findEventState(eventId: string): Promise<EventStateRecord | null>;
  findSeat(seatId: string): Promise<SeatRecord | null>;
  findSeatLabels(seatIds: readonly string[]): Promise<Map<string, string>>;
  /** Marca vencidas as reservas `PENDING` do assento cujo prazo passou. */
  expireStaleReservations(seatId: string): Promise<number>;
  create(reservation: NewReservation): Promise<ReservationRecord>;
  findById(id: string): Promise<ReservationRecord | null>;
  updateStatus(
    id: string,
    status: ReservationStatus,
  ): Promise<ReservationRecord>;
  listByCustomer(
    customerId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: readonly ReservationRecord[]; total: number }>;
}

/** Código do Prisma para violação de unique constraint. */
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNIQUE_VIOLATION
  );
}

export function createReservationsRepository(
  prisma: PrismaClient = sharedPrisma,
): ReservationsRepository {
  return {
    findEventState(eventId) {
      return prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });
    },

    findSeat(seatId) {
      return prisma.seat.findUnique({
        where: { id: seatId },
        select: { id: true, eventId: true, label: true },
      });
    },

    async findSeatLabels(seatIds) {
      const seats = await prisma.seat.findMany({
        where: { id: { in: [...seatIds] } },
        select: { id: true, label: true },
      });

      return new Map(seats.map((seat) => [seat.id, seat.label]));
    },

    async expireStaleReservations(seatId) {
      const { count } = await prisma.reservation.updateMany({
        where: { seatId, status: "PENDING", expiresAt: { lte: new Date() } },
        data: { status: "EXPIRED" },
      });

      return count;
    },

    /**
     * A violação da constraint não é falha interna: é a resposta certa quando
     * alguém chegou primeiro. Traduzi-la aqui é o que permite ao sistema
     * continuar correto sem o lock — o caminho de erro vira caminho de negócio
     * (ADR 0003).
     */
    async create(reservation) {
      try {
        return await prisma.reservation.create({ data: reservation });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Este assento já está reservado");
        }

        throw error;
      }
    },

    findById(id) {
      return prisma.reservation.findUnique({ where: { id } });
    },

    updateStatus(id, status) {
      return prisma.reservation.update({ where: { id }, data: { status } });
    },

    async listByCustomer(customerId, pagination) {
      const [items, total] = await Promise.all([
        prisma.reservation.findMany({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.reservation.count({ where: { customerId } }),
      ]);

      return { items, total };
    },
  };
}
