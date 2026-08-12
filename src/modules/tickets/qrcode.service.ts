import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getEnv } from "../../shared/config/index.js";

export interface TicketPayload {
  readonly ticketId: string;
  readonly eventId: string;
  readonly code: string;
}

/** Alfabeto sem 0/O e 1/I: a portaria digita isto quando a câmera falha. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_GROUPS = 3;
const CODE_GROUP_SIZE = 4;

/**
 * Código do ingresso: aleatório, não sequencial, e legível por gente.
 *
 * Sequencial seria adivinhável — quem tem um ingresso saberia o do vizinho
 * (RN-2). O formato agrupado existe para o caso em que a leitura do QR falha e
 * alguém precisa ditar o código na porta.
 */
export function generateTicketCode(): string {
  const bytes = randomBytes(CODE_GROUPS * CODE_GROUP_SIZE);
  const characters = [...bytes].map(
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "2",
  );

  const groups = Array.from({ length: CODE_GROUPS }, (_unused, index) =>
    characters
      .slice(index * CODE_GROUP_SIZE, (index + 1) * CODE_GROUP_SIZE)
      .join(""),
  );

  return `TKT-${groups.join("-")}`;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: TicketPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function signTicketPayload(payload: TicketPayload): string {
  return sign(encodePayload(payload), getEnv().TICKET_SECRET);
}

/**
 * Conteúdo do QR: `base64url(payload).assinatura`.
 *
 * O payload viaja legível de propósito. O que impede a forja não é escondê-lo, é
 * o fato de a assinatura não poder ser produzida sem o segredo — e é isso que
 * permite à portaria recusar um ingresso inventado **sem consultar o banco**
 * (ADR 0004).
 */
export function buildQrContent(payload: TicketPayload): string {
  const encoded = encodePayload(payload);

  return `${encoded}.${sign(encoded, getEnv().TICKET_SECRET)}`;
}

function equalsInConstantTime(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  // timingSafeEqual exige o mesmo tamanho; tamanhos diferentes já não conferem
  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

/**
 * Verifica o conteúdo do QR e devolve o payload, ou `null` se ele não presta.
 *
 * Devolver `null` em vez de lançar é proposital: para a portaria, assinatura
 * inválida não é excepcional — é uma das respostas previstas, e ela precisa
 * distinguir "inválido" de "já usado" sem tratar exceção.
 */
export function verifyQrContent(qrContent: string): TicketPayload | null {
  const separator = qrContent.lastIndexOf(".");

  if (separator <= 0) {
    return null;
  }

  const encoded = qrContent.slice(0, separator);
  const signature = qrContent.slice(separator + 1);

  if (!equalsInConstantTime(signature, sign(encoded, getEnv().TICKET_SECRET))) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<TicketPayload>;

    if (
      typeof parsed.ticketId !== "string" ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.code !== "string"
    ) {
      return null;
    }

    return { ticketId: parsed.ticketId, eventId: parsed.eventId, code: parsed.code };
  } catch {
    return null;
  }
}
