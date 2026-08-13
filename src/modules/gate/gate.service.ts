import { NotFoundError } from "../../shared/errors/index.js";
import { verifyQrContent } from "../tickets/qrcode.service.js";
import type { GateRepository, GateTicket } from "./gate.repository.js";
import type { ValidateTicketInput, ValidationResult } from "./gate.schema.js";

export interface GateService {
  validate(
    gateUserId: string,
    input: ValidateTicketInput,
  ): Promise<ValidationResult>;
  /** `eventId` opcional: sem ele não há como apontar "evento errado". */
  inspect(code: string, eventId?: string): Promise<ValidationResult>;
}

function ticketSummary(ticket: GateTicket) {
  return {
    code: ticket.code,
    seatLabel: ticket.seatLabel,
    eventTitle: ticket.eventTitle,
  };
}

const INVALID: ValidationResult = {
  result: "INVALID",
  message: "Ingresso inválido",
  ticket: null,
  usedAt: null,
};

/**
 * As recusas que valem tanto para validar quanto para consultar. Extraído para
 * que o balcão não receba respostas diferentes para o mesmo ingresso: antes, a
 * consulta dizia VALID para ingresso de outro evento, e a validação seguinte
 * dizia WRONG_EVENT.
 */
function rejectionFor(
  ticket: GateTicket,
  eventId: string | undefined,
): ValidationResult | null {
  if (eventId !== undefined && ticket.eventId !== eventId) {
    return {
      result: "WRONG_EVENT",
      message: `Este ingresso é de outro evento: ${ticket.eventTitle}`,
      ticket: ticketSummary(ticket),
      usedAt: null,
    };
  }

  if (ticket.eventStatus === "CANCELED") {
    return {
      result: "INVALID",
      message: "Este evento foi cancelado",
      ticket: ticketSummary(ticket),
      usedAt: null,
    };
  }

  return null;
}

export function createGateService(repository: GateRepository): GateService {
  /**
   * Resolve o código a validar.
   *
   * Com QR, a assinatura é conferida **antes de qualquer consulta**: forja é
   * recusada sem tocar no banco (RN-2). Isso também impede que a porta vire um
   * oráculo — quem tenta adivinhar códigos não descobre nada, porque nem chega
   * a consultar.
   *
   * Código digitado não tem assinatura para conferir; ele existe justamente
   * para quando a câmera falha, e a checagem no banco é o que resta.
   */
  function resolveCode(input: ValidateTicketInput): string | null {
    if (input.qrContent) {
      return verifyQrContent(input.qrContent)?.code ?? null;
    }

    return input.code ?? null;
  }

  return {
    async validate(gateUserId, input) {
      const code = resolveCode(input);

      if (!code) {
        return INVALID;
      }

      const ticket = await repository.findByCode(code);

      if (!ticket) {
        return INVALID;
      }

      // Ingresso legítimo na porta errada é WRONG_EVENT, não inválido:
      // recusar como falsificação faria o operador acusar quem só errou de
      // fila (RN-5)
      const rejection = rejectionFor(ticket, input.eventId);

      if (rejection) {
        return rejection;
      }

      const marked = await repository.markAsUsed(ticket.id, gateUserId);

      if (!marked) {
        // Zero linhas afetadas: outro portão validou primeiro. Reler para
        // informar quando a entrada aconteceu.
        const current = await repository.findByCode(code);

        return {
          result: "ALREADY_USED",
          message: "Este ingresso já foi utilizado",
          ticket: ticketSummary(ticket),
          usedAt: current?.usedAt?.toISOString() ?? null,
        };
      }

      return {
        result: "VALID",
        message: `Entrada liberada — assento ${ticket.seatLabel}`,
        ticket: ticketSummary(ticket),
        usedAt: null,
      };
    },

    /** Consulta sem marcar uso: a portaria confere antes de liberar a fila. */
    async inspect(code, eventId) {
      const ticket = await repository.findByCode(code);

      if (!ticket) {
        throw new NotFoundError("Ingresso não encontrado");
      }

      const rejection = rejectionFor(ticket, eventId);

      if (rejection) {
        return rejection;
      }

      return {
        result: ticket.status === "USED" ? "ALREADY_USED" : "VALID",
        message:
          ticket.status === "USED"
            ? "Este ingresso já foi utilizado"
            : "Ingresso válido, ainda não utilizado",
        ticket: ticketSummary(ticket),
        usedAt: ticket.usedAt?.toISOString() ?? null,
      };
    },
  };
}
