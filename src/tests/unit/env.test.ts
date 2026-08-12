import { describe, expect, it } from "vitest";

import { loadEnv } from "../../shared/config/env.js";

const validSource = {
  NODE_ENV: "test",
  PORT: "3000",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
};

describe("loadEnv", () => {
  it("converte PORT para número", () => {
    const env = loadEnv(validSource);

    expect(env.PORT).toBe(3000);
  });

  it("aplica os padrões de NODE_ENV e LOG_LEVEL quando ausentes", () => {
    const { NODE_ENV: _n, LOG_LEVEL: _l, ...withoutOptionals } = validSource;

    const env = loadEnv(withoutOptionals);

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("falha nomeando a variável obrigatória ausente", () => {
    const { DATABASE_URL: _d, ...withoutDatabase } = validSource;

    expect(() => loadEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it("lista todas as variáveis inválidas de uma vez, não só a primeira", () => {
    const broken = { ...validSource, DATABASE_URL: "", REDIS_URL: "" };

    expect(() => loadEnv(broken)).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it("rejeita PORT não numérica", () => {
    const broken = { ...validSource, PORT: "não-é-porta" };

    expect(() => loadEnv(broken)).toThrow(/PORT/);
  });

  it("rejeita PORT fora da faixa de portas válidas", () => {
    const broken = { ...validSource, PORT: "70000" };

    expect(() => loadEnv(broken)).toThrow(/PORT/);
  });
});
