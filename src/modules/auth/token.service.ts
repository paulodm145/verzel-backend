import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import type { Role } from "../../generated/prisma/enums.js";
import { getEnv } from "../../shared/config/index.js";

const ISSUER = "verzel-backend";
const ALGORITHM = "HS256";
const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims {
  readonly userId: string;
  readonly role: Role;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresIn: number;
}

function signingKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

/**
 * Emite o token de acesso. O papel viaja como claim assinada para que a
 * autorização não custe uma consulta ao banco a cada requisição (RN-4).
 */
export async function issueAccessToken(
  claims: AccessTokenClaims,
): Promise<IssuedAccessToken> {
  const expiresIn = getEnv().ACCESS_TOKEN_TTL;
  const issuedAt = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresIn)
    .sign(signingKey());

  return { token, expiresIn };
}

/**
 * Verifica assinatura, emissor e expiração, e devolve as claims.
 *
 * `algorithms` é informado de propósito: sem ele, um token que declara outro
 * algoritmo no cabeçalho — `none`, ou uma troca de HMAC por RSA — poderia ser
 * aceito. É a armadilha clássica de JWT.
 *
 * Lança quando o token não presta. Quem chama traduz isso em 401; distinguir
 * "expirado" de "adulterado" na resposta só ajudaria quem está tentando.
 */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, signingKey(), {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  });

  const { sub, role } = payload;

  if (typeof sub !== "string" || typeof role !== "string") {
    throw new Error("token sem as claims obrigatórias");
  }

  return { userId: sub, role: role as Role };
}

/**
 * Token de renovação: 32 bytes aleatórios, opaco, sem significado interno. Não
 * é um JWT porque não precisa ser lido, só reconhecido (ADR 0010).
 */
export function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

/**
 * O banco guarda isto, nunca o token.
 *
 * SHA-256 basta, ao contrário da senha: 256 bits aleatórios não são atacáveis
 * por dicionário, que é o que o scrypt do ADR 0009 existe para retardar.
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
