import { describe, expect, it } from "vitest";

/**
 * Smoke test do toolchain: garante que o pipeline ESM + TypeScript + Vitest
 * executa. Falha se a configuração de módulos ou do runner regredir, o que de
 * outra forma só apareceria no primeiro teste de verdade.
 */
describe("toolchain", () => {
  it("executa TypeScript em módulos ESM", async () => {
    const { readFile } = await import("node:fs/promises");

    expect(typeof readFile).toBe("function");
  });

  it("preserva os tipos estreitados do modo estrito", () => {
    const values: readonly string[] = ["a"];
    const first = values[0];

    // noUncheckedIndexedAccess: o acesso por índice é `string | undefined`
    expect(first?.toUpperCase()).toBe("A");
  });
});
