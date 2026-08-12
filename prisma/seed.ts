/**
 * Ponto de entrada do seed, no lugar onde o Prisma espera encontrá-lo.
 *
 * A lógica vive em `src/modules/auth/auth.seed.ts`, e não aqui, porque o
 * `rootDir` do TypeScript é `src/`: o que fica fora dele não é verificado nem
 * pode ser importado por teste.
 */
import { runSeed } from "../src/modules/auth/auth.seed.js";

await runSeed();
