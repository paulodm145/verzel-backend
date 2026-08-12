# Plan 0002 — Autenticação

Como a [spec 0002](spec.md) será implementada.

## Abordagem

Três camadas que se empilham: **primitivas criptográficas** (hash de senha,
emissão e verificação de token), **regra de sessão** (cadastro, login, rotação,
revogação) e **borda HTTP** (rotas, middlewares de identidade e de papel).

As primitivas vêm primeiro porque são as únicas peças testáveis sem banco e sem
Express, e porque errar ali é errar em segurança, não em conveniência. Cada uma
vira um módulo com uma responsabilidade só: `password.service.ts` não sabe o que
é usuário, `token.service.ts` não sabe o que é senha.

Duas decisões desta camada viraram ADR: o hash com scrypt nativo
([0009](../../adr/0009-hash-de-senha-com-scrypt-nativo.md)) e o token de
renovação opaco com rotação
([0010](../../adr/0010-refresh-token-opaco-com-rotacao.md)).

O `auth.service.ts` depende de um `AuthRepository` declarado como interface, não
do Prisma. É o que permite testar rotação e detecção de reuso com um repositório
falso, em milissegundos, sem subir banco — e é onde mora a lógica que mais
precisa de teste exaustivo.

### Versões e o que elas impõem

Verificada no npm em 2026-08-12:

| Pacote | Versão | Consequência para o código |
| --- | --- | --- |
| `jose` | `^6.2.8` | ESM puro, sem dependências transitivas; exige Node ≥ 20, que já é o piso do projeto. `jwtVerify` confere `exp` e o algoritmo por padrão, desde que `algorithms` seja informado |

`jose` é a única dependência nova do épico. `node:crypto` cobre scrypt, a
geração aleatória do token de renovação e o SHA-256 que o guarda.

### Por que jose e não uma assinatura própria

O QR Code do Épico 5 assina um payload nosso, com formato nosso, e ali
`node:crypto` basta. JWT é diferente: é formato de terceiros, com armadilhas
conhecidas — `alg: none`, confusão entre HMAC e RSA, `exp` que ninguém confere.
Reimplementá-lo economizaria uma dependência de 0 KB em transitivas e custaria
exatamente o tipo de erro que o desafio procura. A decisão fica registrada aqui;
não é arquitetural o bastante para um ADR.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/auth/password.service.ts` | criar | Derivar e verificar hash de senha (ADR 0009) |
| `src/modules/auth/token.service.ts` | criar | Emitir e verificar o token de acesso; gerar e hashear o de renovação |
| `src/modules/auth/auth.schema.ts` | criar | Schemas Zod de entrada e saída |
| `src/modules/auth/auth.repository.ts` | criar | Interface `AuthRepository` e implementação Prisma |
| `src/modules/auth/auth.service.ts` | criar | Cadastro, login, rotação, revogação |
| `src/modules/auth/auth.controller.ts` | criar | Traduzir HTTP para service e de volta |
| `src/modules/auth/auth.routes.ts` | criar | Montar as cinco rotas com validação |
| `src/shared/middlewares/authenticate.ts` | criar | Bearer → contexto de autenticação |
| `src/shared/middlewares/require-role.ts` | criar | `requireRole(...roles)` |
| `src/shared/config/env.ts` | alterar | `JWT_SECRET`, TTLs dos dois tokens |
| `prisma/schema.prisma` | alterar | Modelo `RefreshToken` |
| `prisma/seed.ts` | criar | Organizador, dois clientes e portaria |
| `prisma.config.ts` | alterar | Registrar o seed |
| `src/app.ts` | alterar | Montar o roteador de auth |
| `src/docs/swagger.ts` | alterar | Documentar as rotas e o esquema Bearer |
| `.env.example`, `README.md` | alterar | Variáveis novas e credenciais de teste |

## Contratos

### Endpoints

| Método | Rota | Papel exigido | Descrição |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | público | Cria cliente e já devolve a sessão |
| `POST` | `/auth/login` | público | Autentica e abre sessão |
| `POST` | `/auth/refresh` | público | Troca o token de renovação por um par novo |
| `POST` | `/auth/logout` | autenticado | Revoga o token de renovação apresentado |
| `GET` | `/auth/me` | autenticado | Perfil do próprio usuário |

`refresh` é público de propósito: quem o chama tem o token de renovação
justamente porque o de acesso já expirou.

### Schemas Zod

```ts
// entrada
registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
});

loginSchema = z.object({ email: z.email().toLowerCase(), password: z.string().min(1) });
refreshSchema = z.object({ refreshToken: z.string().min(1) });

// saída
userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(["ORGANIZER", "CUSTOMER", "GATE"]),
  createdAt: z.iso.datetime(),
});

sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
```

O `registerSchema` não tem campo `role`: o schema do Zod remove o que não
declara, então um corpo com `role: "GATE"` chega ao service sem ele (RN-2, CA-2).
A recusa não precisa ser explícita porque a validação já a torna impossível.

`password` tem mínimo de 8 e máximo de 128 — o teto existe porque scrypt roda
sobre o que receber, e senha de megabytes vira negação de serviço barata.

### Contexto de autenticação

```ts
interface AuthContext { userId: string; role: Role; }
function getAuth(request: Request): AuthContext;  // lança se não autenticado
```

Guardado num `WeakMap` indexado pela requisição, como em
`middlewares/validate.ts` — o mesmo padrão, pela mesma razão: não estender o tipo
`Request` do Express com campos que podem não existir.

### Token de acesso

Claims: `sub` (id do usuário), `role`, `iss: "verzel-backend"`, `iat`, `exp`.
HS256. A verificação exige `algorithms: ["HS256"]` explicitamente — sem isso, um
token com `alg` trocado seria aceito.

## Modelo de dados

Segunda migration do projeto, aditiva: a inicial já foi publicada em `main`.

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

`tokenHash` é único porque é a chave de busca da renovação. `onDelete: Cascade`
porque sessão de usuário apagado não tem significado. `User` ganha o lado inverso
`refreshTokens RefreshToken[]`.

## Estratégia de testes

| Tipo | Alvo | O que prova |
| --- | --- | --- |
| Unitário | `password.service` | CA-4, RN-1 |
| Unitário | `token.service` | CA-8, RN-4, RN-5 |
| Unitário | `auth.service` com repositório falso | CA-2, CA-3, CA-6, CA-10, CA-11 |
| Integração | `POST /auth/register` | CA-1, CA-2, CA-3 |
| Integração | `POST /auth/login` | CA-5, CA-6 |
| Integração | `GET /auth/me` | CA-7, CA-8 |
| Integração | rota de teste com `requireRole` | CA-9 |
| Integração | `POST /auth/refresh` | CA-10, CA-11, CA-13 |
| Integração | `POST /auth/logout` | CA-12 |
| Integração | `prisma/seed.ts` | CA-14, CA-15 |

Os quinze critérios aparecem na tabela.

O CA-6 tem duas metades. Que as respostas sejam idênticas em status, código e
mensagem é verificável por igualdade. Que sejam idênticas em **tempo** não é —
medir latência em teste produz falha intermitente. A parte temporal é garantida
por construção, verificando a senha contra um hash de mentira quando o e-mail não
existe, e o teste unitário prova que esse caminho é percorrido, não que ele leva
o mesmo tanto de milissegundos.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Cada hash de senha custa ~291 ms, e a suíte tem vários | Fixtures reaproveitam usuários; o seed roda uma vez por arquivo de teste, não por caso |
| `maxmem` padrão do Node derruba o scrypt com `N = 2^15` | `maxmem` explícito em 64 MiB, com teste que deriva um hash de verdade |
| Rotação e detecção de reuso são sensíveis a concorrência: dois refresh simultâneos com o mesmo token | A troca acontece em transação, e o `@unique` em `tokenHash` é a garantia final — o perdedor da corrida vê o token já revogado e cai no caminho de reuso |
| `JWT_SECRET` fraco em desenvolvimento vazando para produção | `.env.example` sem valor real; o env valida comprimento mínimo de 32 caracteres |
| Detecção de reuso derruba sessão legítima em retry de rede | Consequência aceita no ADR 0010; documentada no README |
