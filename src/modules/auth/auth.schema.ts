import { z } from "zod";

/**
 * Não existe campo `role` aqui, e é de propósito: o Zod descarta o que não
 * declara, então um corpo com `role: "GATE"` chega ao service sem ele. O
 * cadastro público cria apenas CUSTOMER, e a recusa não precisa ser explícita
 * porque a validação já a torna impossível (RN-2).
 *
 * O teto de 128 caracteres na senha existe porque o scrypt roda sobre o que
 * receber: senha de megabytes seria negação de serviço barata.
 */
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  // Sem mínimo: quem erra a senha recebe 401, não 400. Exigir tamanho aqui
  // contaria ao atacante que a senha certa tem pelo menos aquele tamanho.
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(["ORGANIZER", "CUSTOMER", "GATE"]),
  createdAt: z.iso.datetime(),
});

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Segundos até o token de acesso expirar. */
  expiresIn: z.number().int().positive(),
});

export const registerResponseSchema = z.object({
  user: userSchema,
  session: sessionSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type UserOutput = z.infer<typeof userSchema>;
export type SessionOutput = z.infer<typeof sessionSchema>;
