import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../../modules/auth/password.service.js";

const PASSWORD = "senha-bem-comprida-123";

/** Deriva no formato do módulo, mas com custo antigo — simula hash legado. */
function hashWithLegacyCost(password: string): string {
  const cost = { N: 2 ** 14, r: 8, p: 5 };
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, {
    ...cost,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    cost.N,
    cost.r,
    cost.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

describe("hashPassword", () => {
  it("não guarda a senha em lugar nenhum do resultado", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("gera hashes diferentes para a mesma senha — o sal é por usuário", async () => {
    const [first, second] = await Promise.all([
      hashPassword(PASSWORD),
      hashPassword(PASSWORD),
    ]);

    expect(second).not.toBe(first);
  });

  it("registra os parâmetros de custo junto do hash", async () => {
    const stored = await hashPassword(PASSWORD);
    const [algorithm, n, r, p] = stored.split("$");

    expect(algorithm).toBe("scrypt");
    expect(Number(n)).toBe(2 ** 15);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(3);
  });
});

describe("verifyPassword", () => {
  it("aceita a senha correta", async () => {
    const stored = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("recusa a senha errada", async () => {
    const stored = await hashPassword(PASSWORD);

    await expect(verifyPassword("outra-senha-qualquer", stored)).resolves.toBe(
      false,
    );
  });

  it("verifica hash gerado com custo antigo — endurecer o custo não invalida conta", async () => {
    const legacy = hashWithLegacyCost(PASSWORD);

    await expect(verifyPassword(PASSWORD, legacy)).resolves.toBe(true);
    await expect(verifyPassword("errada", legacy)).resolves.toBe(false);
  });

  it("responde false para hash malformado, em vez de lançar", async () => {
    const malformed = [
      "",
      "scrypt$",
      "scrypt$32768$8$3$só-uma-parte",
      "bcrypt$32768$8$3$c2Fs$aGFzaA",
      "scrypt$abc$8$3$c2Fs$aGFzaA",
    ];

    for (const stored of malformed) {
      await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
    }
  });

  it("expõe um hash de mentira que nunca casa, para o login sem usuário", async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith("scrypt$")).toBe(true);

    await expect(verifyPassword(PASSWORD, DUMMY_PASSWORD_HASH)).resolves.toBe(
      false,
    );
  });

  it("faz o hash de mentira custar a derivação inteira", async () => {
    // Um hash de mentira malformado seria recusado no parse, sem derivar nada —
    // barato, e portanto distinguível por tempo de um login com e-mail real.
    // Isto é o que garante que ele exercita o mesmo trabalho (RN-3).
    const [, n, r, p, salt, hash] = DUMMY_PASSWORD_HASH.split("$");

    expect(Number(n)).toBe(2 ** 15);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(3);
    expect(Buffer.from(salt ?? "", "base64url")).toHaveLength(16);
    expect(Buffer.from(hash ?? "", "base64url")).toHaveLength(64);

    const startedAt = performance.now();
    await verifyPassword(PASSWORD, DUMMY_PASSWORD_HASH);

    // Limite inferior folgado: a derivação real leva ~291 ms, e o caminho barato
    // levaria microssegundos. Não é medida de latência, é prova de que derivou.
    expect(performance.now() - startedAt).toBeGreaterThan(50);
  });
});
