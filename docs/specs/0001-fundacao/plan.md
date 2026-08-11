# Plan 0001 — Fundação

Como a [spec 0001](spec.md) será implementada.

## Abordagem

Três blocos que se encaixam de baixo para cima: **infraestrutura** (Docker,
Prisma, Redis), **borda HTTP** (erro, validação, logger) e **documentação**
(OpenAPI). Cada bloco fecha antes do seguinte, porque o de cima depende do de
baixo para ser testável de verdade.

O schema Prisma entra **completo** já nesta migration, e não fatiado por épico.
Modelo de dados fatiado gera uma sequência de migrations que só faz sentido lida
em conjunto, e neste caso as entidades são interdependentes — `Reservation`
referencia `Seat` e `Event`, e o índice do ADR 0003 depende dos três existirem.
O comportamento é que fica para os épicos seguintes; a estrutura vem agora.

Três decisões deste plano viraram ADR: a versão do TypeScript
([0006](../../adr/0006-fixar-typescript-na-linha-6.md)), a geração do OpenAPI
([0007](../../adr/0007-openapi-nativo-do-zod.md)) e o runner de testes
([0008](../../adr/0008-vitest-como-runner-de-testes.md)).

### Versões e o que elas impõem

Verificadas no npm e na documentação oficial em 2026-08-11:

| Pacote | Versão | Consequência para o código |
| --- | --- | --- |
| `typescript` | `~6.0.3` | A 7 quebra o `typescript-eslint` — ADR 0006 |
| `express` | `^5.2.1` | Promessa rejeitada em handler `async` vai sozinha ao error handler; `req.body` é `undefined` sem parser; curinga vira `/*splat` |
| `zod` | `^4.4.3` | `z.toJSONSchema()` nativo — ADR 0007 |
| `prisma` / `@prisma/client` | `^7.9.1` | Generator `prisma-client` (o `-js` está obsoleto) exige `output`; `partialIndexes` continua preview; **a URL sai do schema** — migrations a leem de `prisma.config.ts` e o client a recebe via `@prisma/adapter-pg` |
| `redis` | `^6.2.1` | RESP3 por padrão e **timeout de comando de 5 s**, que antes não existia |
| `eslint` | `^10.8.1` | Só flat config |
| `vitest` | `^4.1.10` | ADR 0008 |
| `pino` | `^10.3.1` | Log estruturado |
| `swagger-ui-express` | `^5.0.1` | Serve a interface; não traduz schema |

O Node 20.20 do ambiente satisfaz o mínimo de todos — Prisma exige `^20.19`,
ESLint `^20.19`, Redis `>=20`. É o piso real do projeto e vai no `engines`.

O timeout de comando do node-redis v6 importa mais do que parece: um `SET NX PX`
de aquisição de lock que estoure 5 segundos passa a rejeitar. No Épico 4 isso
precisa cair no caminho de "lock não adquirido", nunca em erro 500 — o
[ADR 0003](../../adr/0003-lock-redis-com-constraint-no-banco.md) já exige que o
sistema siga correto sem Redis.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `package.json`, `tsconfig.json`, `eslint.config.ts` | criar | Toolchain |
| `docker-compose.yml`, `.env.example` | criar | Postgres e Redis com volumes nomeados |
| `prisma/schema.prisma` | criar | Modelo completo, incluindo o índice do ADR 0003 |
| `prisma.config.ts` | criar | Conexão das migrations — no Prisma 7 ela sai do schema |
| `src/shared/config/env.ts` | criar | Ambiente validado por Zod na partida |
| `src/shared/lib/prisma.ts` | criar | Instância única do client |
| `src/shared/lib/redis.ts` | criar | Conexão, desligamento limpo, estado para o health |
| `src/shared/lib/logger.ts` | criar | Pino com `requestId` |
| `src/shared/errors/*.ts` | criar | `AppError` e derivadas |
| `src/shared/middlewares/validate.ts` | criar | Validação Zod de body, query e params |
| `src/shared/middlewares/error-handler.ts` | criar | Formato único de resposta de erro |
| `src/shared/middlewares/request-id.ts` | criar | Correlação entre resposta e log |
| `src/docs/swagger.ts` | criar | Documento OpenAPI e registro de schemas |
| `src/app.ts`, `src/server.ts` | criar | Montagem do Express e ciclo de vida |
| `src/modules/health/*` | criar | `GET /health` |

`app.ts` separado de `server.ts` de propósito: o teste de integração importa a
aplicação sem abrir porta.

## Contratos

### Endpoints

| Método | Rota | Papel exigido | Descrição |
| --- | --- | --- | --- |
| `GET` | `/health` | público | Estado de Postgres e Redis |
| `GET` | `/docs` | público | Swagger UI |
| `GET` | `/docs.json` | público | Documento OpenAPI |

### Erros de domínio

```ts
abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: ErrorDetail[];
}
```

`NotFoundError` → 404 · `ConflictError` → 409 · `ValidationError` → 400 ·
`UnauthorizedError` → 401 · `ForbiddenError` → 403.

As três últimas nascem aqui embora só sejam usadas no Épico 2: o error handler
precisa mapear a hierarquia inteira desde o início, senão o épico seguinte
altera código de fundação para acrescentar um caso.

O handler distingue erro **esperado** de **inesperado**: `AppError` responde com
seu próprio código e mensagem; qualquer outra coisa vira `500 INTERNAL_ERROR`
com `requestId` e nada mais, com a stack só no log (RN-3).

### Middleware de validação

```ts
validate({ body: schema, query: schema, params: schema })
```

Substitui a propriedade validada pelo resultado tipado do parse, para que o
handler receba o dado já convertido. Em Express 5, `req.query` é somente leitura;
o valor validado é anexado a uma propriedade própria em vez de sobrescrito.

## Modelo de dados

Entidades da seção 5 do `CLAUDE.md`, com duas correções vindas dos ADRs: `Seat`
não tem coluna de status (ADR 0002) e `Reservation` recebe o índice único parcial
(ADR 0003).

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  previewFeatures = ["partialIndexes"]
}

model Reservation {
  id         String            @id @default(uuid())
  eventId    String
  customerId String
  seatId     String
  status     ReservationStatus
  expiresAt  DateTime
  createdAt  DateTime          @default(now())

  @@unique([seatId], where: raw("status IN ('PENDING','CONFIRMED')"))
  @@index([status, expiresAt])
}
```

`User`, `Event`, `Seat`, `Payment` e `Ticket` seguem o `CLAUDE.md`, com
`Ticket.code` único. O índice `[status, expiresAt]` serve à varredura de
expiração da camada 3 do ADR 0003.

Se `partialIndexes` falhar por ser preview, o plano B do ADR 0003 vale: declarar
o índice em SQL cru dentro da migration. A garantia é a mesma; muda o lugar.

## Estratégia de testes

| Tipo | Alvo | O que prova |
| --- | --- | --- |
| Integração | migration aplicada | CA-3, CA-4, CA-5 |
| Integração | `GET /health` | CA-6, CA-7 |
| Integração | rota com schema inválido | CA-8 |
| Integração | rota que lança `AppError` | CA-9 |
| Integração | rota `async` que rejeita | CA-10 |
| Integração | `GET /docs.json` | CA-11 |
| Unitário | `config/env` | CA-12 |
| Unitário | `error-handler` | RN-2, RN-3 |
| Script | `npm run typecheck`, `npm run lint` | CA-2 |
| Manual | subir do zero, derrubar e subir de novo | CA-1, RN-7 |

O CA-4 é testado **por SQL direto**, sem passar pela aplicação. É o que
diferencia provar que a garantia está no banco de provar que o service se
comporta bem.

CA-1 e RN-7 ficam manuais nesta entrega: automatizar ciclo de vida de container
exigiria infraestrutura de teste desproporcional ao que se quer verificar. O
`tasks.md` traz os comandos exatos.

## Riscos

| Risco | Mitigação |
| --- | --- |
| `partialIndexes` sendo preview quebra a migration | Plano B do ADR 0003: SQL cru na migration |
| Testes de integração exigem Postgres e Redis reais | Usar os containers do compose com um banco de teste separado; sem banco, os testes falham em vez de passar silenciosamente |
| Timeout de 5 s do node-redis surpreende no Épico 4 | Documentado aqui e no ADR 0003; o health check já exercita o caminho degradado |
| Generator `prisma-client` gera dentro de `src/` | `src/generated/` no `.gitignore`, e `npm run db:generate` no `postinstall` |
