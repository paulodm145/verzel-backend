import { randomUUID } from "node:crypto";

import type {
  EventChanges,
  EventRecord,
  EventsRepository,
  NewEvent,
} from "../../modules/events/events.repository.js";

export interface FakeEventsRepository extends EventsRepository {
  readonly events: Map<string, EventRecord>;
  readonly seatCounts: Map<string, number>;
}

/** Repositório em memória, para exercitar as regras sem banco. */
export function createFakeEventsRepository(): FakeEventsRepository {
  const events = new Map<string, EventRecord>();
  const seatCounts = new Map<string, number>();

  return {
    events,
    seatCounts,

    create(event: NewEvent) {
      const record: EventRecord = {
        ...event,
        id: randomUUID(),
        description: event.description,
        imageUrl: event.imageUrl,
        status: "DRAFT",
        createdAt: new Date(),
      };
      events.set(record.id, record);
      seatCounts.set(record.id, event.capacity);

      return Promise.resolve(record);
    },

    findById(id) {
      return Promise.resolve(events.get(id) ?? null);
    },

    update(id, changes: EventChanges) {
      const current = events.get(id);

      if (!current) {
        return Promise.reject(new Error("evento inexistente"));
      }

      const updated: EventRecord = { ...current, ...changes };
      events.set(id, updated);

      return Promise.resolve(updated);
    },

    replaceSeats(eventId, capacity) {
      seatCounts.set(eventId, capacity);

      return Promise.resolve();
    },

    list(filter) {
      const items = [...events.values()].filter((event) => {
        const byStatus = !filter.status || event.status === filter.status;
        const byOwner =
          !filter.organizerId || event.organizerId === filter.organizerId;
        const bySearch =
          !filter.search ||
          event.title.toLowerCase().includes(filter.search.toLowerCase());

        return byStatus && byOwner && bySearch;
      });

      return Promise.resolve({
        items: items.slice(filter.skip, filter.skip + filter.take),
        total: items.length,
      });
    },

    countAvailableSeats(eventId) {
      return Promise.resolve(seatCounts.get(eventId) ?? 0);
    },
  };
}
