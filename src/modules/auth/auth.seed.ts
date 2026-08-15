import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaClient as PrismaClientImpl } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { getEnv } from "../../shared/config/index.js";
import { createConfiguredProviders } from "../catalog/catalog.factory.js";
import type { CatalogItem } from "../catalog/catalog.types.js";
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
 * Cenário fixo reservado ao fluxo completo de compra e validação. As outras
 * 99 sessões saem do catálogo de filmes do TMDb durante a execução do seed.
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

export const SEED_EVENT_COUNT = 100;

const eventVenues = [
  "Cine Arena",
  "Teatro Municipal",
  "Auditório Central",
  "Arena Verzel",
  "Centro Cultural",
] as const;

/**
 * O TMDb não tem endpoint de "listar tudo": a busca exige um termo. Estes são
 * genéricos o bastante para, somados, renderem bem mais que os 99 filmes
 * necessários — e variados o bastante para o catálogo não sair todo com o
 * mesmo tema.
 */
const catalogQueries = [
  "amor",
  "guerra",
  "aventura",
  "mistério",
  "herói",
  "família",
  "viagem",
  "cidade",
] as const;

const CATALOG_PAGES_PER_QUERY = 2;

/** Janela em que as sessões são distribuídas, a partir de amanhã. */
const SESSION_WINDOW_DAYS = 60;

const sessionHoursUtc = [18, 21] as const;

const SEEDED_TICKET_SEAT = "A1";

/**
 * Recria o cenário de demonstração do zero: o catálogo é apagado e semeado de
 * novo a cada execução, então o resultado não depende do que havia antes.
 *
 * Os usuários são a exceção — vão por `upsert` de e-mail, sem reescrever a
 * senha de quem já existe, para que quem estiver com uma sessão aberta continue
 * com ela.
 */
export async function seedDatabase(
  prisma: PrismaClient,
  catalogItems: readonly CatalogItem[],
): Promise<void> {
  await clearCatalog(prisma);

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
  await seedMovieSessions(prisma, catalogItems);
}

/**
 * Apaga o cenário de demonstração inteiro, na ordem inversa das dependências.
 * Usuários e tokens ficam de fora de propósito (ver `seedDatabase`).
 */
async function clearCatalog(prisma: PrismaClient): Promise<void> {
  await prisma.ticket.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.event.deleteMany();
}

/**
 * A data que o TMDb entrega é a de lançamento, quase sempre no passado — e
 * evento no passado some da listagem do cliente e não aceita reserva. Cada
 * filme vira então uma sessão nos próximos dias, espalhada de forma
 * determinística pelo índice para o catálogo não nascer todo no mesmo dia.
 */
function sessionDateFor(index: number): Date {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  date.setUTCDate(date.getUTCDate() + (index % SESSION_WINDOW_DAYS) + 1);
  date.setUTCHours(sessionHoursUtc[index % sessionHoursUtc.length] ?? 21);

  return date;
}

/**
 * Completa o catálogo de demonstração até 100 eventos, um por filme. Preço,
 * capacidade e local derivam do índice: nada de aleatório, para que duas
 * execuções seguidas produzam a mesma base.
 */
async function seedMovieSessions(
  prisma: PrismaClient,
  catalogItems: readonly CatalogItem[],
): Promise<void> {
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: "organizador@verzel.test" },
  });
  // Sem pôster o card do evento nasce vazio no frontend, então filme sem imagem
  // não entra no catálogo de demonstração.
  const usableItems = catalogItems
    .filter((item): item is CatalogItem & { imageUrl: string } =>
      Boolean(item.imageUrl),
    )
    .slice(0, SEED_EVENT_COUNT - 1);

  if (usableItems.length < SEED_EVENT_COUNT - 1) {
    throw new Error(
      `O TMDb retornou apenas ${String(usableItems.length)} filmes com pôster; são necessários ${String(SEED_EVENT_COUNT - 1)}.`,
    );
  }

  for (const [index, item] of usableItems.entries()) {
    const capacity = 20 + (index % 5) * 10;
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        sourceType: item.sourceType,
        externalId: item.externalId,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        date: sessionDateFor(index),
        venue: eventVenues.at(index % eventVenues.length) ?? "Arena Verzel",
        capacity,
        price: 25 + (index % 8) * 10,
        status: "PUBLISHED",
      },
    });

    await prisma.seat.createMany({
      data: seatLabelsFor(capacity).map((label) => ({
        eventId: event.id,
        label,
      })),
    });
  }
}

/**
 * Busca os filmes pelo mesmo port que o resto do sistema usa. O seed não fala
 * com o TMDb direto: se amanhã a fonte virar outra, o adapter absorve (ADR
 * 0005).
 */
async function loadTmdbMovies(): Promise<CatalogItem[]> {
  const provider = createConfiguredProviders().find(
    (candidate) => candidate.name === "tmdb",
  );

  if (!provider) {
    throw new Error(
      "TMDB_API_KEY precisa estar configurada para executar o seed de eventos.",
    );
  }

  const byQuery = await Promise.all(
    catalogQueries.map(async (query) => {
      const pages = await Promise.all(
        Array.from({ length: CATALOG_PAGES_PER_QUERY }, (_unused, index) =>
          provider.search({ query, page: index + 1 }),
        ),
      );

      return pages.flat();
    }),
  );

  return interleave(byQuery);
}

/**
 * Intercala os resultados dos termos em vez de esgotar um antes de passar ao
 * seguinte: como cada busca devolve 20 filmes por página, sem isso os dois
 * primeiros termos preencheriam sozinhos as 99 vagas.
 *
 * Título repetido é descartado junto com o id repetido — o TMDb tem vários
 * filmes distintos chamados "Amor", e um catálogo de demonstração com seis
 * cartões de mesmo nome só confunde quem estiver avaliando.
 */
function interleave(byQuery: readonly (readonly CatalogItem[])[]): CatalogItem[] {
  const selected = new Map<string, CatalogItem>();
  const seenTitles = new Set<string>();
  const longest = Math.max(...byQuery.map((items) => items.length));

  for (let index = 0; index < longest; index += 1) {
    for (const items of byQuery) {
      const item = items.at(index);

      if (!item) {
        continue;
      }

      const title = item.title.trim().toLowerCase();

      if (seenTitles.has(title)) {
        continue;
      }

      seenTitles.add(title);
      selected.set(item.externalId, item);
    }
  }

  return [...selected.values()];
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
    const catalogItems = await loadTmdbMovies();
    await seedDatabase(prisma, catalogItems);
    console.log(
      `Seed concluído: ${String(seedUsers.length)} usuários e ${String(SEED_EVENT_COUNT)} sessões de filme.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
