import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  createRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  verifyAccessToken,
} from "../../modules/auth/token.service.js";

const userId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("token de acesso", () => {
  it("devolve o usuário e o papel que assinou", async () => {
    const { token } = await issueAccessToken({ userId, role: "CUSTOMER" });

    const claims = await verifyAccessToken(token);

    expect(claims).toEqual({ userId, role: "CUSTOMER" });
  });

  it("informa em quantos segundos expira", async () => {
    const { expiresIn } = await issueAccessToken({ userId, role: "GATE" });

    expect(expiresIn).toBeGreaterThan(0);
  });

  it("recusa token assinado com outra chave", async () => {
    const alien = await new SignJWT({ role: "ORGANIZER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("verzel-backend")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres"));

    await expect(verifyAccessToken(alien)).rejects.toThrow();
  });

  it("recusa token expirado", async () => {
    const expired = await new SignJWT({ role: "CUSTOMER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("verzel-backend")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET ?? ""));

    await expect(verifyAccessToken(expired)).rejects.toThrow();
  });

  it("recusa token sem assinatura, com alg none", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        role: "GATE",
        iss: "verzel-backend",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");

    await expect(verifyAccessToken(`${header}.${payload}.`)).rejects.toThrow();
  });

  it("recusa token adulterado no papel", async () => {
    const { token } = await issueAccessToken({ userId, role: "CUSTOMER" });
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sub: userId,
        role: "GATE",
        iss: "verzel-backend",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");

    await expect(
      verifyAccessToken(`${header ?? ""}.${forged}.${signature ?? ""}`),
    ).rejects.toThrow();
  });

  it("recusa lixo que nem parece um token", async () => {
    await expect(verifyAccessToken("não-é-um-token")).rejects.toThrow();
  });
});

describe("token de renovação", () => {
  it("gera tokens distintos a cada chamada", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createRefreshToken()),
    );

    expect(tokens.size).toBe(50);
  });

  it("guarda um hash, nunca o token — nem quem lê o banco usa a sessão", () => {
    const token = createRefreshToken();

    const hash = hashRefreshToken(token);

    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it("deriva o mesmo hash para o mesmo token", () => {
    const token = createRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });
});
