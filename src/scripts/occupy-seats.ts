import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import type { PrismaClient } from "../generated/prisma/client.js";
import { PrismaClient as PrismaClientImpl } from "../generated/prisma/client.js";
import { createPaymentsRepository } from "../modules/payments/payments.repository.js";
import { createPaymentsService } from "../modules/payments/payments.service.js";
import { createReservationsRepository } from "../modules/reservations/reservations.repository.js";
import { createReservationsService } from "../modules/reservations/reservations.service.js";
import { getEnv } from "../shared/config/index.js";
import { ConflictError } from "../shared/errors/index.js";
import { disconnectRedis } from "../shared/lib/redis.js";

/** Uma reserva a cada cinco fica pendente de pagamento. */
const PENDING_EVERY = 5;

const DEFAULT_RATE = 0.4;

export const occupySeatsOptionsSchema = z.object({
  /** Fração dos assentos de cada evento que termina ocupada. */
  rate: z.coerce.number().min(0).max(1).default(DEFAULT_RATE),
  /** Sem isto, todos os eventos publicados são ocupados. */
  eventId: z.uuid().optional(),
});

export type OccupySeatsOptions = z.input<typeof occupySeatsOptionsSchema>;

export interface OccupySeatsReport {
  readonly events: number;
  readonly confirmed: number;
  readonly pending: number;
  /** Assentos que outra reserva levou no meio do caminho. */
  readonly skipped: number;
}

/**
 * Gerador determinístico (mulberry32). Semeado pela chave natural do evento —
 * `externalId` e data — e não pelo id, que é um uuid novo a cada base: assim o
 * mesmo evento recebe o mesmo mapa depois de um `db:seed`, e o print de ontem
 * continua valendo hoje.
 */
function createRandom(seed: string): () => number {
  let state = 0;

  for (const char of seed) {
    state = (Math.imul(state, 31) + char.charCodeAt(0)) >>> 0;
  }

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Embaralha de verdade (Fisher-Yates) em vez de espalhar os ocupados de N em N:
 * mapa com assento sim, assento não denuncia o dado sintético na hora.
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swapped = shuffled[target];

    if (current !== undefined && swapped !== undefined) {
      shuffled[index] = swapped;
      shuffled[target] = current;
    }
  }

  return shuffled;
}

interface EventToOccupy {
  readonly id: string;
  readonly externalId: string;
  readonly date: Date;
  readonly capacity: number;
}

async function findEvents(
  prisma: PrismaClient,
  eventId: string | undefined,
): Promise<EventToOccupy[]> {
  return prisma.event.findMany({
    where: { status: "PUBLISHED", ...(eventId ? { id: eventId } : {}) },
    select: { id: true, externalId: true, date: true, capacity: true },
    orderBy: { date: "asc" },
  });
}

/**
 * Ocupa parte do mapa de assentos dos eventos publicados, passando pelos
 * mesmos services que a API usa.
 *
 * Escrever reserva, pagamento e ingresso direto no banco seria mais rápido, mas
 * reimplantaria aqui as regras do ADR 0003 e da emissão do QR — e um mapa de
 * demonstração que diverge do que a API produz não serve para demonstrar nada.
 */
export async function occupySeats(
  prisma: PrismaClient,
  options: OccupySeatsOptions = {},
): Promise<OccupySeatsReport> {
  if (getEnv().NODE_ENV === "production") {
    throw new Error(
      "occupy-seats gera dados de demonstração e não roda em produção.",
    );
  }

  const { rate, eventId } = occupySeatsOptionsSchema.parse(options);
  const reservations = createReservationsService(
    createReservationsRepository(prisma),
  );
  const payments = createPaymentsService(
    createPaymentsRepository(prisma),
    createReservationsRepository(prisma),
  );

  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (customers.length === 0) {
    throw new Error(
      "Nenhum cliente no banco. Rode `npm run db:seed` antes de ocupar o mapa.",
    );
  }

  const events = await findEvents(prisma, eventId);
  let confirmed = 0;
  let pending = 0;
  let skipped = 0;

  for (const event of events) {
    const seats = await prisma.seat.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        label: true,
        reservations: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: { id: true },
        },
      },
      orderBy: { label: "asc" },
    });

    const free = seats.filter((seat) => seat.reservations.length === 0);
    const target = Math.round(event.capacity * rate);
    // Completa o que falta em vez de somar por cima: rodar duas vezes com a
    // mesma taxa não muda nada, e subir a taxa só acrescenta a diferença.
    const missing = Math.max(0, target - (seats.length - free.length));
    const random = createRandom(`${event.externalId}:${event.date.toISOString()}`);
    const chosen = shuffle(free, random).slice(0, missing);

    for (const [index, seat] of chosen.entries()) {
      const customer = customers[index % customers.length];

      if (!customer) {
        continue;
      }

      try {
        const reservation = await reservations.reserve(
          customer.id,
          event.id,
          seat.id,
        );

        // A pendente existe para o mapa ter os dois estados que o cliente vê:
        // lugar vendido e lugar em processo de compra.
        if ((index + 1) % PENDING_EVERY === 0) {
          pending += 1;
          continue;
        }

        await payments.pay(customer.id, reservation.id, {
          paymentMethod: "CREDIT_CARD",
          simulate: "APPROVED",
        });
        confirmed += 1;
      } catch (error) {
        // Assento levado por outra reserva entre a leitura e a escrita: é
        // exatamente o que a constraint existe para impedir, e aqui só custa
        // um lugar a menos no mapa.
        if (error instanceof ConflictError) {
          skipped += 1;
          continue;
        }

        throw error;
      }
    }
  }

  return { events: events.length, confirmed, pending, skipped };
}

function parseArgv(argv: readonly string[]): OccupySeatsOptions {
  const values = new Map<string, string>();

  for (const argument of argv) {
    const match = /^--(?<key>[a-z]+)=(?<value>.+)$/u.exec(argument);
    const key = match?.groups?.key;
    const value = match?.groups?.value;

    if (key !== undefined && value !== undefined) {
      values.set(key, value);
    }
  }

  const rate = values.get("rate");
  const eventId = values.get("event");

  return {
    ...(rate === undefined ? {} : { rate }),
    ...(eventId === undefined ? {} : { eventId }),
  };
}

/** Ponto de entrada do script `npm run db:seats`. */
export async function runOccupySeats(argv: readonly string[]): Promise<void> {
  const prisma = new PrismaClientImpl({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
  });

  try {
    const report = await occupySeats(prisma, parseArgv(argv));

    console.log(
      `Mapa ocupado em ${String(report.events)} evento(s): ` +
        `${String(report.confirmed)} confirmadas, ${String(report.pending)} pendentes` +
        (report.skipped > 0
          ? `, ${String(report.skipped)} assento(s) disputado(s) e pulado(s)`
          : ""),
    );
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}
