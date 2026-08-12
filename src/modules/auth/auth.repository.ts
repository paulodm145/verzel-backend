import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly createdAt: Date;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
}

export interface NewRefreshToken {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/**
 * O que o `auth.service` precisa do armazenamento, e nada além disso.
 *
 * Declarado como interface para que o service seja testável com um repositório
 * falso: rotação e detecção de reuso são a lógica mais delicada do épico, e
 * exercitá-las não deveria custar uma ida ao banco por caso de teste.
 */
export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(user: NewUser): Promise<UserRecord>;
  createRefreshToken(token: NewRefreshToken): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Revoga um token e cria o seu substituto na mesma transação. É o que impede
   * que uma falha no meio da rotação deixe o usuário sem sessão nenhuma ou com
   * duas válidas.
   */
  rotateRefreshToken(
    currentId: string,
    replacement: NewRefreshToken,
  ): Promise<RefreshTokenRecord>;
  revokeRefreshToken(id: string): Promise<void>;
  /** Usada quando um token revogado reaparece: derruba a sessão inteira. */
  revokeAllRefreshTokensOfUser(userId: string): Promise<void>;
}

export function createAuthRepository(
  prisma: PrismaClient = sharedPrisma,
): AuthRepository {
  return {
    findUserByEmail(email) {
      return prisma.user.findUnique({ where: { email } });
    },

    findUserById(id) {
      return prisma.user.findUnique({ where: { id } });
    },

    createUser(user) {
      return prisma.user.create({ data: user });
    },

    createRefreshToken(token) {
      return prisma.refreshToken.create({ data: token });
    },

    findRefreshTokenByHash(tokenHash) {
      return prisma.refreshToken.findUnique({ where: { tokenHash } });
    },

    async rotateRefreshToken(currentId, replacement) {
      const [, created] = await prisma.$transaction([
        prisma.refreshToken.update({
          where: { id: currentId },
          data: { revokedAt: new Date() },
        }),
        prisma.refreshToken.create({ data: replacement }),
      ]);

      return created;
    },

    async revokeRefreshToken(id) {
      await prisma.refreshToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    },

    async revokeAllRefreshTokensOfUser(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
