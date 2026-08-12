import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.js";
import type {
  EventRecord,
  EventsRepository,
  ListFilter,
} from "./events.repository.js";
import type {
  CreateEventInput,
  EventDetailOutput,
  EventOutput,
  ListEventsInput,
  UpdateEventInput,
} from "./events.schema.js";

export interface EventsService {
  create(organizerId: string, input: CreateEventInput): Promise<EventOutput>;
  update(
    organizerId: string,
    eventId: string,
    changes: UpdateEventInput,
  ): Promise<EventOutput>;
  publish(organizerId: string, eventId: string): Promise<EventOutput>;
  cancel(organizerId: string, eventId: string): Promise<EventOutput>;
  listPublished(filter: ListEventsInput): Promise<{
    items: EventOutput[];
    total: number;
  }>;
  listOwned(
    organizerId: string,
    filter: ListEventsInput,
  ): Promise<{ items: EventOutput[]; total: number }>;
  detail(eventId: string): Promise<EventDetailOutput>;
}

function toOutput(event: EventRecord): EventOutput {
  return {
    id: event.id,
    organizerId: event.organizerId,
    sourceType: event.sourceType,
    externalId: event.externalId,
    title: event.title,
    description: event.description,
    imageUrl: event.imageUrl,
    date: event.date.toISOString(),
    venue: event.venue,
    capacity: event.capacity,
    // Decimal do Prisma não é number; a borda HTTP precisa de um
    price: Number(event.price),
    status: event.status,
    createdAt: event.createdAt.toISOString(),
  };
}

export function createEventsService(
  repository: EventsRepository,
): EventsService {
  /**
   * Carrega o evento exigindo que o solicitante seja o dono.
   *
   * O `organizerId` vem do token, nunca do corpo (RN-6). Evento de outro dono
   * responde 403, e não 404: o organizador que erra o id de um evento existente
   * merece saber que ele existe e não é dele.
   */
  async function loadOwned(
    organizerId: string,
    eventId: string,
  ): Promise<EventRecord> {
    const event = await repository.findById(eventId);

    if (!event) {
      throw new NotFoundError("Evento não encontrado");
    }

    if (event.organizerId !== organizerId) {
      throw new ForbiddenError("Este evento é de outro organizador");
    }

    return event;
  }

  return {
    async create(organizerId, input) {
      const created = await repository.create({
        organizerId,
        sourceType: input.sourceType,
        externalId: input.externalId,
        title: input.title,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        date: new Date(input.date),
        venue: input.venue,
        capacity: input.capacity,
        price: input.price,
      });

      return toOutput(created);
    },

    /**
     * Capacidade só muda em rascunho (RN-8). Depois de publicado há gente
     * comprando: encolher o mapa apagaria assento vendido, e regenerá-lo
     * invalidaria reservas em curso.
     */
    async update(organizerId, eventId, changes) {
      const event = await loadOwned(organizerId, eventId);
      const capacityChanged =
        changes.capacity !== undefined && changes.capacity !== event.capacity;

      if (capacityChanged && event.status !== "DRAFT") {
        throw new ConflictError(
          "A capacidade só pode mudar enquanto o evento é rascunho",
        );
      }

      if (event.status === "CANCELED") {
        throw new ConflictError("Evento cancelado não pode ser editado");
      }

      const updated = await repository.update(eventId, {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.description !== undefined
          ? { description: changes.description ?? null }
          : {}),
        ...(changes.imageUrl !== undefined
          ? { imageUrl: changes.imageUrl ?? null }
          : {}),
        ...(changes.date !== undefined ? { date: new Date(changes.date) } : {}),
        ...(changes.venue !== undefined ? { venue: changes.venue } : {}),
        ...(changes.capacity !== undefined
          ? { capacity: changes.capacity }
          : {}),
        ...(changes.price !== undefined ? { price: changes.price } : {}),
      });

      if (capacityChanged && changes.capacity !== undefined) {
        await repository.replaceSeats(eventId, changes.capacity);
      }

      return toOutput(updated);
    },

    async publish(organizerId, eventId) {
      const event = await loadOwned(organizerId, eventId);

      // Cancelado é estado final: ressuscitar um evento cancelado confundiria
      // quem já foi avisado de que ele não acontece mais (RN-10)
      if (event.status === "CANCELED") {
        throw new ConflictError("Evento cancelado não volta a ser publicado");
      }

      if (event.status === "PUBLISHED") {
        return toOutput(event);
      }

      return toOutput(await repository.update(eventId, { status: "PUBLISHED" }));
    },

    async cancel(organizerId, eventId) {
      const event = await loadOwned(organizerId, eventId);

      if (event.status === "CANCELED") {
        return toOutput(event);
      }

      return toOutput(await repository.update(eventId, { status: "CANCELED" }));
    },

    async listPublished(filter) {
      const page = await repository.list({
        ...paginationOf(filter),
        status: "PUBLISHED",
      });

      return { items: page.items.map(toOutput), total: page.total };
    },

    async listOwned(organizerId, filter) {
      const page = await repository.list({
        ...paginationOf(filter),
        organizerId,
      });

      return { items: page.items.map(toOutput), total: page.total };
    },

    /**
     * Detalhe público: rascunho e cancelado não existem para quem não é o dono
     * (RN-9). Responder 404 em vez de 403 é deliberado — a existência de um
     * rascunho alheio não é informação pública.
     */
    async detail(eventId) {
      const event = await repository.findById(eventId);

      if (event?.status !== "PUBLISHED") {
        throw new NotFoundError("Evento não encontrado");
      }

      return {
        ...toOutput(event),
        availableSeatsCount: await repository.countAvailableSeats(eventId),
      };
    },
  };
}

function paginationOf(filter: ListEventsInput): ListFilter {
  return {
    skip: filter.skip,
    take: filter.take,
    ...(filter.search === undefined ? {} : { search: filter.search }),
  };
}
