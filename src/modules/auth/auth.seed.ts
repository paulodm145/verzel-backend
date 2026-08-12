import { PrismaPg } from "@prisma/adapter-pg";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaClient as PrismaClientImpl } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { getEnv } from "../../shared/config/index.js";
import { hashPassword } from "./password.service.js";

interface SeedUser {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: Role;
}

/**
 * Usuários de teste. As senhas são fracas e públicas de propósito: são
 * credenciais de demonstração, documentadas no README, e este seed nunca roda
 * contra produção.
 *
 * O cadastro público cria apenas CUSTOMER (RN-2), então organizador e portaria
 * só podem vir daqui.
 */
export const seedUsers: readonly SeedUser[] = [
  {
    name: "Olívia Organizadora",
    email: "organizador@verzel.test",
    password: "organizador123",
    role: "ORGANIZER",
  },
  {
    name: "Caio Cliente",
    email: "cliente1@verzel.test",
    password: "cliente123",
    role: "CUSTOMER",
  },
  {
    name: "Clara Cliente",
    email: "cliente2@verzel.test",
    password: "cliente123",
    role: "CUSTOMER",
  },
  {
    name: "Pedro Portaria",
    email: "portaria@verzel.test",
    password: "portaria123",
    role: "GATE",
  },
];

/**
 * Idempotente: `upsert` por e-mail. Rodar o seed duas vezes não duplica conta
 * nem reescreve a senha de quem já existe — quem estiver com uma sessão aberta
 * continua com ela.
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash: await hashPassword(user.password),
        role: user.role,
      },
    });
  }
}

/** Ponto de entrada do script `npm run db:seed`. */
export async function runSeed(): Promise<void> {
  const prisma = new PrismaClientImpl({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
  });

  try {
    await seedDatabase(prisma);
    console.log(`Seed concluído: ${String(seedUsers.length)} usuários.`);
  } finally {
    await prisma.$disconnect();
  }
}
