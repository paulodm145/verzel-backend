import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaClient as PrismaClientImpl } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { getEnv } from "../../shared/config/index.js";
import { seatLabelsFor } from "../events/events.repository.js";
import {
  generateTicketCode,
  signTicketPayload,
} from "../tickets/qrcode.service.js";
import { hashPassword } from "./password.service.js";

interface SeedUser {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: Role;
}

/**
 * Usuários de teste. As senhas são fracas e públicas de propósito: são
 * credenciais de demonstração, documentadas no README, e este seed nunca roda
 * contra produção.
 *
 * O cadastro público cria apenas CUSTOMER (RN-2), então organizador e portaria
 * só podem vir daqui.
 */
export const seedUsers: readonly SeedUser[] = [
  {
    name: "Olívia Organizadora",
    email: "organizador@verzel.test",
    password: "organizador123",
    role: "ORGANIZER",
  },
  {
    name: "Caio Cliente",
    email: "cliente1@verzel.test",
    password: "cliente123",
    role: "CUSTOMER",
  },
  {
    name: "Clara Cliente",
    email: "cliente2@verzel.test",
    password: "cliente123",
    role: "CUSTOMER",
  },
  {
    name: "Pedro Portaria",
    email: "portaria@verzel.test",
    password: "portaria123",
    role: "GATE",
  },
];

/**
 * Evento de demonstração. Os dados são fixos, com a cara de um item vindo do
 * catálogo, e não de uma chamada ao TMDb: seed que depende de rede falha
 * justamente na máquina de quem está avaliando (RN-2).
 */
const seedEvent = {
  sourceType: "MOVIE" as const,
  externalId: "550",
  title: "Clube da Luta — Sessão Especial",
  description: "Sessão de estreia com debate depois do filme.",
  imageUrl: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  venue: "Cine Arena",
  capacity: 30,
  price: 45,
};

const SEEDED_TICKET_SEAT = "A1";

/**
 * Idempotente: `upsert` por e-mail. Rodar o seed duas vezes não duplica conta
 * nem reescreve a senha de quem já existe — quem estiver com uma sessão aberta
 * continua com ela.
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash: await hashPassword(user.password),
        role: user.role,
      },
    });
  }

  await seedShowcase(prisma);
}

/**
 * Monta um cenário completo: evento publicado com assentos, uma compra
 * concluída e o ingresso emitido.
 *
 * O ingresso pronto existe para que a portaria — o fluxo mais trabalhoso de
 * montar à mão — possa ser exercitada logo na primeira execução.
 */
async function seedShowcase(prisma: PrismaClient): Promise<void> {
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: "organizador@verzel.test" },
  });
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: "cliente1@verzel.test" },
  });

  const date = new Date("2026-12-20T21:00:00.000Z");
  const existing = await prisma.event.findFirst({
    where: {
      organizerId: organizer.id,
      externalId: seedEvent.externalId,
      date,
    },
  });

  if (existing) {
    return;
  }

  const event = await prisma.event.create({
    data: { ...seedEvent, organizerId: organizer.id, date, status: "PUBLISHED" },
  });

  await prisma.seat.createMany({
    data: seatLabelsFor(seedEvent.capacity).map((label) => ({
      eventId: event.id,
      label,
    })),
  });

  const seat = await prisma.seat.findFirstOrThrow({
    where: { eventId: event.id, label: SEEDED_TICKET_SEAT },
  });

  const reservation = await prisma.reservation.create({
    data: {
      eventId: event.id,
      customerId: customer.id,
      seatId: seat.id,
      status: "CONFIRMED",
      expiresAt: new Date(Date.now() + 600_000),
    },
  });

  await prisma.payment.create({
    data: { reservationId: reservation.id, status: "APPROVED" },
  });

  const ticketId = randomUUID();
  const code = generateTicketCode();

  await prisma.ticket.create({
    data: {
      id: ticketId,
      reservationId: reservation.id,
      code,
      qrSignature: signTicketPayload({ ticketId, eventId: event.id, code }),
    },
  });

  console.log(`Evento publicado: ${event.title}`);
  console.log(`Ingresso pronto para a portaria: ${code} (assento ${SEEDED_TICKET_SEAT})`);
}

/** Ponto de entrada do script `npm run db:seed`. */
export async function runSeed(): Promise<void> {
  const prisma = new PrismaClientImpl({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
  });

  try {
    await seedDatabase(prisma);
    console.log(`Seed concluído: ${String(seedUsers.length)} usuários.`);
  } finally {
    await prisma.$disconnect();
  }
}
