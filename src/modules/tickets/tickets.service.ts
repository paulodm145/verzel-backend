import { getEnv } from "../../shared/config/index.js";
import { NotFoundError } from "../../shared/errors/index.js";
import { buildQrContent } from "./qrcode.service.js";
import type {
  TicketsRepository,
  TicketWithContext,
} from "./tickets.repository.js";
import type { PublicTicketOutput, TicketOutput } from "./tickets.schema.js";

export interface TicketsService {
  listMine(
    customerId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: TicketOutput[]; total: number }>;
  findByCode(code: string): Promise<PublicTicketOutput>;
}

/**
 * O `qrContent` é remontado na leitura, e não lido do banco: o que está gravado
 * é a assinatura, e o conteúdo completo é derivável dela com o payload. Guardar
 * as duas coisas seria duplicar o mesmo fato em dois lugares.
 */
function toPublicOutput(ticket: TicketWithContext): PublicTicketOutput {
  return {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    qrContent: buildQrContent({
      ticketId: ticket.id,
      eventId: ticket.event.id,
      code: ticket.code,
    }),
    seatLabel: ticket.seatLabel,
    usedAt: ticket.usedAt?.toISOString() ?? null,
    event: {
      id: ticket.event.id,
      title: ticket.event.title,
      date: ticket.event.date.toISOString(),
      venue: ticket.event.venue,
    },
  };
}

export function createTicketsService(
  repository: TicketsRepository,
): TicketsService {
  function shareUrlOf(code: string): string {
    return `${getEnv().APP_BASE_URL}/tickets/${code}`;
  }

  return {
    async listMine(customerId, pagination) {
      const page = await repository.listByCustomer(customerId, pagination);

      return {
        items: page.items.map((ticket) => ({
          ...toPublicOutput(ticket),
          shareUrl: shareUrlOf(ticket.code),
        })),
        total: page.total,
      };
    },

    /**
     * Consulta pública por código — é o link compartilhado. O código é
     * aleatório e não adivinhável, então quem tem o link tem o ingresso, que é
     * o comportamento pedido; o que ele não tem é acesso aos dados de quem
     * comprou.
     */
    async findByCode(code) {
      const ticket = await repository.findByCode(code);

      if (!ticket) {
        throw new NotFoundError("Ingresso não encontrado");
      }

      return toPublicOutput(ticket);
    },
  };
}
