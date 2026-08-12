import { randomUUID } from "node:crypto";

import type {
  AuthRepository,
  NewRefreshToken,
  NewUser,
  RefreshTokenRecord,
  UserRecord,
} from "../../modules/auth/auth.repository.js";

interface StoredToken extends RefreshTokenRecord {
  readonly tokenHash: string;
}

export interface FakeAuthRepository extends AuthRepository {
  /** Estado interno, para o teste inspecionar o que a regra fez. */
  readonly users: Map<string, UserRecord>;
  readonly tokens: Map<string, StoredToken>;
}

/**
 * Repositório em memória com o mesmo contrato do de Prisma.
 *
 * Existe para que os casos de rotação e de reuso rodem em milissegundos: são
 * muitos, e cada um deles contra o banco custaria uma transação real sem provar
 * nada a mais sobre a regra.
 */
export function createFakeAuthRepository(): FakeAuthRepository {
  const users = new Map<string, UserRecord>();
  const tokens = new Map<string, StoredToken>();

  function put(token: StoredToken): StoredToken {
    tokens.set(token.id, token);

    return token;
  }

  return {
    users,
    tokens,

    findUserByEmail(email) {
      const found = [...users.values()].find((user) => user.email === email);

      return Promise.resolve(found ?? null);
    },

    findUserById(id) {
      return Promise.resolve(users.get(id) ?? null);
    },

    createUser(user: NewUser) {
      const record: UserRecord = {
        ...user,
        id: randomUUID(),
        createdAt: new Date(),
      };
      users.set(record.id, record);

      return Promise.resolve(record);
    },

    createRefreshToken(token: NewRefreshToken) {
      const stored = put({
        id: randomUUID(),
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        revokedAt: null,
      });

      return Promise.resolve(stored);
    },

    findRefreshTokenByHash(tokenHash) {
      const found = [...tokens.values()].find(
        (token) => token.tokenHash === tokenHash,
      );

      return Promise.resolve(found ?? null);
    },

    rotateRefreshToken(currentId, replacement) {
      const current = tokens.get(currentId);

      if (current) {
        put({ ...current, revokedAt: new Date() });
      }

      const created = put({
        id: randomUUID(),
        userId: replacement.userId,
        tokenHash: replacement.tokenHash,
        expiresAt: replacement.expiresAt,
        revokedAt: null,
      });

      return Promise.resolve(created);
    },

    revokeRefreshToken(id) {
      const token = tokens.get(id);

      if (token) {
        put({ ...token, revokedAt: new Date() });
      }

      return Promise.resolve();
    },

    revokeAllRefreshTokensOfUser(userId) {
      for (const token of tokens.values()) {
        if (token.userId === userId && !token.revokedAt) {
          put({ ...token, revokedAt: new Date() });
        }
      }

      return Promise.resolve();
    },
  };
}
