import { describe, expect, it } from "vitest";

import {
  loginSchema,
  registerSchema,
  sessionSchema,
} from "../../modules/auth/auth.schema.js";

const validRegistration = {
  name: "Pessoa Cliente",
  email: "Pessoa@Example.com",
  password: "senha-de-teste-123",
};

describe("registerSchema", () => {
  it("descarta o papel enviado pelo cliente — cadastro público não escolhe papel", () => {
    const parsed = registerSchema.parse({
      ...validRegistration,
      role: "GATE",
    });

    expect(parsed).not.toHaveProperty("role");
  });

  it("normaliza o e-mail para minúsculas", () => {
    const parsed = registerSchema.parse(validRegistration);

    expect(parsed.email).toBe("pessoa@example.com");
  });

  it("apara espaços em volta do nome", () => {
    const parsed = registerSchema.parse({
      ...validRegistration,
      name: "  Pessoa Cliente  ",
    });

    expect(parsed.name).toBe("Pessoa Cliente");
  });

  it("recusa senha curta demais", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "curta",
    });

    expect(result.success).toBe(false);
  });

  it("recusa senha longa o bastante para pesar no scrypt", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "a".repeat(129),
    });

    expect(result.success).toBe(false);
  });

  it("recusa e-mail malformado", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      email: "não-é-email",
    });

    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("aceita qualquer senha não vazia — errar senha dá 401, não 400", () => {
    const result = loginSchema.safeParse({
      email: "pessoa@example.com",
      password: "x",
    });

    expect(result.success).toBe(true);
  });

  it("recusa senha vazia", () => {
    const result = loginSchema.safeParse({
      email: "pessoa@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("sessionSchema", () => {
  it("descreve o par de tokens e o prazo do acesso", () => {
    const parsed = sessionSchema.parse({
      accessToken: "jwt",
      refreshToken: "opaco",
      expiresIn: 900,
    });

    expect(parsed.expiresIn).toBe(900);
  });
});
