import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requestId, getRequestId } from "../../shared/middlewares/request-id.js";

function fakeExchange(headers: Record<string, string> = {}) {
  const setHeader = vi.fn();
  const request = { headers } as unknown as Request;
  const response = { setHeader } as unknown as Response;
  const next: NextFunction = vi.fn();

  return { request, response, next, setHeader };
}

describe("requestId", () => {
  it("gera um identificador quando a requisição não traz nenhum", () => {
    const { request, response, next } = fakeExchange();

    requestId(request, response, next);

    expect(getRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
    expect(next).toHaveBeenCalledOnce();
  });

  it("reaproveita o identificador enviado pelo cliente", () => {
    const { request, response, next } = fakeExchange({
      "x-request-id": "vindo-do-cliente",
    });

    requestId(request, response, next);

    expect(getRequestId(request)).toBe("vindo-do-cliente");
  });

  it("devolve o identificador no cabeçalho da resposta", () => {
    const { request, response, next, setHeader } = fakeExchange();

    requestId(request, response, next);

    expect(setHeader).toHaveBeenCalledWith(
      "x-request-id",
      getRequestId(request),
    );
  });

  it("ignora um cabeçalho vazio e gera um identificador próprio", () => {
    const { request, response, next } = fakeExchange({ "x-request-id": "  " });

    requestId(request, response, next);

    expect(getRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("recusa um identificador longo demais para não poluir o log", () => {
    const { request, response, next } = fakeExchange({
      "x-request-id": "x".repeat(300),
    });

    requestId(request, response, next);

    expect(getRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
