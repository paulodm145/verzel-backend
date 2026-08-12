import { beforeEach, describe, expect, it } from "vitest";

import {
  createEventsService,
  type EventsService,
} from "../../modules/events/events.service.js";
import type { CreateEventInput } from "../../modules/events/events.schema.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.js";
import {
  createFakeEventsRepository,
  type FakeEventsRepository,
} from "../helpers/fake-events-repository.js";

const dono = "11111111-1111-1111-1111-111111111111";
const outro = "22222222-2222-2222-2222-222222222222";

const entrada: CreateEventInput = {
  externalId: "550",
  sourceType: "MOVIE",
  title: "Clube da Luta",
  description: null,
  imageUrl: null,
  date: "2026-11-20T23:00:00.000Z",
  venue: "Cine Arena",
  capacity: 10,
  price: 45.5,
};

let repository: FakeEventsRepository;
let service: EventsService;

beforeEach(() => {
  repository = createFakeEventsRepository();
  service = createEventsService(repository);
});

describe("criação", () => {
  it("nasce rascunho, do organizador do token, com o mapa de assentos", async () => {
    const event = await service.create(dono, entrada);

    expect(event.status).toBe("DRAFT");
    expect(event.organizerId).toBe(dono);
    expect(repository.seatCounts.get(event.id)).toBe(10);
  });

  it("converte o preço para número na saída", async () => {
    const event = await service.create(dono, entrada);

    expect(event.price).toBe(45.5);
  });
});

describe("propriedade", () => {
  it("recusa edição de evento alheio", async () => {
    const event = await service.create(dono, entrada);

    await expect(
      service.update(outro, event.id, { title: "Sequestrado" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.events.get(event.id)?.title).toBe(entrada.title);
  });

  it("recusa publicar e cancelar evento alheio", async () => {
    const event = await service.create(dono, entrada);

    await expect(service.publish(outro, event.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(service.cancel(outro, event.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("responde 404 para evento que não existe", async () => {
    await expect(
      service.publish(dono, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("capacidade", () => {
  it("regenera o mapa quando a capacidade muda em rascunho", async () => {
    const event = await service.create(dono, entrada);

    await service.update(dono, event.id, { capacity: 30 });

    expect(repository.seatCounts.get(event.id)).toBe(30);
  });

  it("recusa mudar a capacidade depois de publicado", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);

    await expect(
      service.update(dono, event.id, { capacity: 30 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.seatCounts.get(event.id)).toBe(10);
  });

  it("deixa editar os demais campos depois de publicado", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);

    const updated = await service.update(dono, event.id, {
      venue: "Outro Lugar",
    });

    expect(updated.venue).toBe("Outro Lugar");
  });

  it("não regenera o mapa quando a capacidade vem igual", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);

    await expect(
      service.update(dono, event.id, { capacity: 10, venue: "Mesmo Lugar" }),
    ).resolves.toMatchObject({ venue: "Mesmo Lugar" });
  });
});

describe("transições de estado", () => {
  it("publica um rascunho", async () => {
    const event = await service.create(dono, entrada);

    await expect(service.publish(dono, event.id)).resolves.toMatchObject({
      status: "PUBLISHED",
    });
  });

  it("publicar de novo é inofensivo", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);

    await expect(service.publish(dono, event.id)).resolves.toMatchObject({
      status: "PUBLISHED",
    });
  });

  it("recusa publicar evento cancelado", async () => {
    const event = await service.create(dono, entrada);
    await service.cancel(dono, event.id);

    await expect(service.publish(dono, event.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("recusa editar evento cancelado", async () => {
    const event = await service.create(dono, entrada);
    await service.cancel(dono, event.id);

    await expect(
      service.update(dono, event.id, { venue: "Outro" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("visibilidade", () => {
  const paginacao = { skip: 0, take: 20 };

  it("a listagem pública só mostra publicados", async () => {
    const publicado = await service.create(dono, entrada);
    await service.publish(dono, publicado.id);
    await service.create(dono, { ...entrada, externalId: "551" });

    const lista = await service.listPublished(paginacao);

    expect(lista.total).toBe(1);
    expect(lista.items[0]?.id).toBe(publicado.id);
  });

  it("o organizador vê os próprios rascunhos e não os alheios", async () => {
    await service.create(dono, entrada);
    await service.create(outro, { ...entrada, externalId: "551" });

    const meus = await service.listOwned(dono, paginacao);

    expect(meus.total).toBe(1);
    expect(meus.items[0]?.organizerId).toBe(dono);
  });

  it("filtra a listagem pública por título", async () => {
    const clube = await service.create(dono, entrada);
    await service.publish(dono, clube.id);
    const outroFilme = await service.create(dono, {
      ...entrada,
      externalId: "552",
      title: "Matrix",
    });
    await service.publish(dono, outroFilme.id);

    const lista = await service.listPublished({ ...paginacao, search: "matrix" });

    expect(lista.items.map((item) => item.title)).toEqual(["Matrix"]);
  });

  it("o detalhe público traz a contagem de assentos livres", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);

    await expect(service.detail(event.id)).resolves.toMatchObject({
      availableSeatsCount: 10,
    });
  });

  it("o detalhe de rascunho responde 404, não 403", async () => {
    const event = await service.create(dono, entrada);

    await expect(service.detail(event.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o detalhe de cancelado responde 404", async () => {
    const event = await service.create(dono, entrada);
    await service.publish(dono, event.id);
    await service.cancel(dono, event.id);

    await expect(service.detail(event.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
