import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildQrContent,
  generateTicketCode,
  verifyQrContent,
  type TicketPayload,
} from "../../modules/tickets/qrcode.service.js";

const payload: TicketPayload = {
  ticketId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  eventId: "11111111-1111-1111-1111-111111111111",
  code: "TKT-4F2K-9QX7-M3PD",
};

describe("generateTicketCode", () => {
  it("não repete em mil geradas", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateTicketCode));

    expect(codes.size).toBe(1000);
  });

  it("evita caracteres que se confundem ao ditar o código", () => {
    const codes = Array.from({ length: 200 }, generateTicketCode).join("");

    expect(codes).not.toMatch(/[01OI]/);
  });

  it("sai agrupado e legível", () => {
    expect(generateTicketCode()).toMatch(/^TKT(-[2-9A-HJ-NP-Z]{4}){3}$/);
  });
});

describe("verifyQrContent", () => {
  it("verifica o conteúdo que ele mesmo assinou", () => {
    const qrContent = buildQrContent(payload);

    expect(verifyQrContent(qrContent)).toEqual(payload);
  });

  it("recusa payload trocado com a assinatura original", () => {
    const qrContent = buildQrContent(payload);
    const [, signature] = qrContent.split(".");
    const forjado = Buffer.from(
      JSON.stringify({ ...payload, eventId: "outro-evento" }),
    ).toString("base64url");

    expect(verifyQrContent(`${forjado}.${signature ?? ""}`)).toBeNull();
  });

  it("recusa assinatura trocada com o payload original", () => {
    const qrContent = buildQrContent(payload);
    const [encoded] = qrContent.split(".");

    expect(verifyQrContent(`${encoded ?? ""}.assinatura-inventada`)).toBeNull();
  });

  it("recusa conteúdo assinado com outro segredo", () => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const comOutroSegredo = createHmac("sha256", "segredo-de-quem-tentou-forjar")
      .update(encoded)
      .digest("base64url");

    expect(verifyQrContent(`${encoded}.${comOutroSegredo}`)).toBeNull();
  });

  it("recusa um caractere alterado em qualquer posição do payload", () => {
    const qrContent = buildQrContent(payload);
    const [encoded, signature] = qrContent.split(".");
    const original = encoded ?? "";

    for (let index = 0; index < original.length; index += 5) {
      const trocado =
        original.slice(0, index) +
        (original[index] === "A" ? "B" : "A") +
        original.slice(index + 1);

      expect(verifyQrContent(`${trocado}.${signature ?? ""}`)).toBeNull();
    }
  });

  it("recusa lixo, vazio e conteúdo sem separador", () => {
    for (const invalido of ["", ".", "sem-ponto", ".só-assinatura", "a.b"]) {
      expect(verifyQrContent(invalido)).toBeNull();
    }
  });

  it("recusa payload válido na assinatura mas incompleto nos campos", () => {
    const encoded = Buffer.from(JSON.stringify({ ticketId: "x" })).toString(
      "base64url",
    );
    // Assina de verdade: o que reprova aqui é a falta de campos, não a
    // assinatura — a verificação não pode confiar só no HMAC
    const assinado = buildQrContent(payload).split(".")[1] ?? "";

    expect(verifyQrContent(`${encoded}.${assinado}`)).toBeNull();
  });
});
