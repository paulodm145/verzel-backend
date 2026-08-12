import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  createEventsRepository,
  seatLabelsFor,
  type EventsRepository,
} from "../../modules/events/events.repository.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

const organizerId = "99999999-9999-9999-9999-999999999999";

describe("EventsRepository", () => {
  let prisma: PrismaClient;
  let repository: EventsRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    repository = createEventsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.user.create({
      data: {
        id: organizerId,
        name: "Olívia Organizadora",
        email: "org@example.com",
        passwordHash: "scrypt$hash",
        role: "ORGANIZER",
      },
    });
  });

  let sequence = 0;

  // Cada evento precisa de externalId próprio: a chave única de Event impede o
  // mesmo organizador de repetir o mesmo item de catálogo na mesma data
  function newEvent(overrides: Partial<{ capacity: number; title: string }> = {}) {
    sequence += 1;

    return repository.create({
      organizerId,
      sourceType: "SHOW",
      externalId: `ext-${String(sequence)}`,
      title: overrides.title ?? "Show da Banda",
      description: null,
      imageUrl: null,
      date: new Date("2026-11-20T23:00:00Z"),
      venue: "Arena",
      capacity: overrides.capacity ?? 3,
      price: 150,
    });
  }

  it("cria o evento como rascunho, com um assento por unidade de capacidade", async () => {
    const event = await newEvent({ capacity: 25 });

    expect(event.status).toBe("DRAFT");
    await expect(prisma.seat.count({ where: { eventId: event.id } })).resolves.toBe(25);
  });

  it("gera rótulos únicos e legíveis", async () => {
    const event = await newEvent({ capacity: 21 });

    const seats = await prisma.seat.findMany({
      where: { eventId: event.id },
      orderBy: { label: "asc" },
      select: { label: true },
    });
    const labels = seats.map((seat) => seat.label);

    expect(new Set(labels).size).toBe(21);
    expect(labels).toContain("A1");
    expect(labels).toContain("A20");
    expect(labels).toContain("B1");
  });

  it("conta assentos livres, e a contagem cai quando há reserva ativa", async () => {
    const event = await newEvent({ capacity: 3 });
    const customer = await prisma.user.create({
      data: {
        name: "Caio",
        email: "caio@example.com",
        passwordHash: "scrypt$hash",
        role: "CUSTOMER",
      },
    });
    const seat = await prisma.seat.findFirstOrThrow({ where: { eventId: event.id } });

    await expect(repository.countAvailableSeats(event.id)).resolves.toBe(3);

    await prisma.reservation.create({
      data: {
        eventId: event.id,
        customerId: customer.id,
        seatId: seat.id,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    await expect(repository.countAvailableSeats(event.id)).resolves.toBe(2);
  });

  it("não conta reserva encerrada como ocupação", async () => {
    const event = await newEvent({ capacity: 2 });
    const customer = await prisma.user.create({
      data: {
        name: "Clara",
        email: "clara@example.com",
        passwordHash: "scrypt$hash",
        role: "CUSTOMER",
      },
    });
    const seat = await prisma.seat.findFirstOrThrow({ where: { eventId: event.id } });

    await prisma.reservation.create({
      data: {
        eventId: event.id,
        customerId: customer.id,
        seatId: seat.id,
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(repository.countAvailableSeats(event.id)).resolves.toBe(2);
  });

  it("troca o mapa inteiro quando a capacidade muda", async () => {
    const event = await newEvent({ capacity: 3 });

    await repository.replaceSeats(event.id, 7);

    await expect(prisma.seat.count({ where: { eventId: event.id } })).resolves.toBe(7);
  });

  it("filtra a listagem por status, dono e título", async () => {
    const publicado = await newEvent({ title: "Show da Banda" });
    await repository.update(publicado.id, { status: "PUBLISHED" });
    await newEvent({ title: "Rascunho Escondido" });

    const publicados = await repository.list({ skip: 0, take: 10, status: "PUBLISHED" });
    const porTitulo = await repository.list({ skip: 0, take: 10, search: "banda" });
    const doDono = await repository.list({ skip: 0, take: 10, organizerId });

    expect(publicados.total).toBe(1);
    expect(porTitulo.total).toBe(1);
    expect(doDono.total).toBe(2);
  });

  it("pagina com skip e take", async () => {
    await newEvent({ title: "Primeiro" });
    await newEvent({ title: "Segundo" });
    await newEvent({ title: "Terceiro" });

    const pagina = await repository.list({ skip: 1, take: 1 });

    expect(pagina.items).toHaveLength(1);
    expect(pagina.total).toBe(3);
  });
});

describe("seatLabelsFor", () => {
  it("vira de fileira a cada vinte assentos", () => {
    const labels = seatLabelsFor(41);

    expect(labels[0]).toBe("A1");
    expect(labels[19]).toBe("A20");
    expect(labels[20]).toBe("B1");
    expect(labels[40]).toBe("C1");
  });
});
