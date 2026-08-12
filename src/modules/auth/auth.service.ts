import { ConflictError, UnauthorizedError } from "../../shared/errors/index.js";
import { getEnv } from "../../shared/config/index.js";
import type { AuthRepository, UserRecord } from "./auth.repository.js";
import type {
  LoginInput,
  RegisterInput,
  SessionOutput,
  UserOutput,
} from "./auth.schema.js";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "./password.service.js";
import {
  createRefreshToken,
  hashRefreshToken,
  issueAccessToken,
} from "./token.service.js";

/**
 * Mensagem única para e-mail inexistente e senha errada. Distinguir os dois
 * casos entregaria a quem tenta adivinhar uma lista de contas válidas (RN-3).
 */
const INVALID_CREDENTIALS = "E-mail ou senha inválidos";

export interface AuthenticatedUser {
  readonly user: UserOutput;
  readonly session: SessionOutput;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthenticatedUser>;
  login(input: LoginInput): Promise<AuthenticatedUser>;
  profile(userId: string): Promise<UserOutput>;
}

function toUserOutput(user: UserRecord): UserOutput {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createAuthService(repository: AuthRepository): AuthService {
  async function startSession(user: UserRecord): Promise<SessionOutput> {
    const { token: accessToken, expiresIn } = await issueAccessToken({
      userId: user.id,
      role: user.role,
    });

    const refreshToken = createRefreshToken();

    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + getEnv().REFRESH_TOKEN_TTL * 1000),
    });

    return { accessToken, refreshToken, expiresIn };
  }

  return {
    /**
     * O papel é fixado aqui, não lido da entrada: cadastro público cria apenas
     * cliente, e organizador e portaria nascem do seed (RN-2).
     */
    async register(input) {
      const existing = await repository.findUserByEmail(input.email);

      if (existing) {
        throw new ConflictError("Já existe uma conta com este e-mail");
      }

      const user = await repository.createUser({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: "CUSTOMER",
      });

      return { user: toUserOutput(user), session: await startSession(user) };
    },

    /**
     * Quando o e-mail não existe, a senha é verificada mesmo assim, contra um
     * hash de mentira. Sem isso, a resposta sairia em microssegundos e o tempo
     * denunciaria quais contas existem, por mais idêntico que fosse o corpo.
     */
    async login(input) {
      const user = await repository.findUserByEmail(input.email);
      const passwordMatches = await verifyPassword(
        input.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || !passwordMatches) {
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }

      return { user: toUserOutput(user), session: await startSession(user) };
    },

    /**
     * O token pode ser válido e o usuário já não existir. Isso é 401, não 404:
     * quem apresenta credencial de uma conta apagada não está autenticado.
     */
    async profile(userId) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new UnauthorizedError("Sessão inválida");
      }

      return toUserOutput(user);
    },
  };
}
