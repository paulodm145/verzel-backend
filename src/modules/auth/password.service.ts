import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Custo do scrypt (ADR 0009). É uma das combinações que o OWASP trata como
 * equivalentes ao mínimo recomendado; medida neste projeto em ~291 ms, contra
 * 1134 ms de `N = 2^17`, com a mesma segurança nominal.
 */
const COST = { N: 2 ** 15, r: 8, p: 3 } as const;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * `N = 2^15` exige 128 × N × r = 32 MiB, que bate exatamente no `maxmem` padrão
 * do Node — sem elevá-lo, a derivação falha.
 */
const MAX_MEMORY = 64 * 1024 * 1024;

interface Cost {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

function derive(password: string, salt: Buffer, cost: Cost): Promise<Buffer> {
  const options: ScryptOptions = { ...cost, maxmem: MAX_MEMORY };

  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

/**
 * Deriva o hash de uma senha, no formato `scrypt$N$r$p$sal$hash`.
 *
 * Os parâmetros de custo viajam junto com o hash de propósito: endurecer o custo
 * mais tarde não pode invalidar as senhas já cadastradas, e a verificação
 * precisa saber com que custo aquele hash foi gerado.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await derive(password, salt, COST);

  return [
    "scrypt",
    COST.N,
    COST.r,
    COST.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

interface ParsedHash {
  readonly cost: Cost;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function parse(stored: string): ParsedHash | undefined {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return undefined;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const cost = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };

  if (!Object.values(cost).every((value) => Number.isInteger(value) && value > 0)) {
    return undefined;
  }

  const hash = Buffer.from(rawHash, "base64url");

  if (hash.length !== KEY_LENGTH) {
    return undefined;
  }

  return { cost, salt: Buffer.from(rawSalt, "base64url"), hash };
}

/**
 * Confere uma senha contra o hash armazenado.
 *
 * Hash ilegível responde `false` em vez de lançar: para quem chama, senha que
 * não confere e registro corrompido levam ao mesmo lugar — negar o acesso.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);

  if (!parsed) {
    return false;
  }

  const derived = await derive(password, parsed.salt, parsed.cost);

  // Comparar com === vazaria, pelo tempo, quão perto o palpite chegou
  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Hash de uma senha aleatória que ninguém conhece, usado quando o login recebe
 * um e-mail inexistente. Verificar contra ele faz o caminho "usuário não existe"
 * custar o mesmo que "senha errada", para que o tempo de resposta não denuncie
 * quais contas existem (RN-3).
 *
 * Fixo no código, e não derivado na partida, para não gastar 291 ms toda vez que
 * o processo sobe.
 */
export const DUMMY_PASSWORD_HASH =
  "scrypt$32768$8$3$YnVzY2FuZG8tdGVtcG8xMg$" +
  "F5cJZ9YQKXvOePV3hV0Vv7lY0hV1MdFvKk9nErCqOn6ZBYRJHb0hLbEy1zEo9AyBIL9dLxHl0nRPh6cwJEeRPg";
