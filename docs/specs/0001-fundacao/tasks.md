# Tasks 0001 — Fundação

Quebra do [plan 0001](plan.md) em commits atômicos. Uma tarefa está pronta quando
o código existe, os testes dela passam e o build não quebra.

## Tarefas

### Bloco 1 — Toolchain

- [x] **T-1** — Iniciar o projeto Node com TypeScript estrito e ESLint flat
      config. `tsconfig.json` com `strict`, `noUncheckedIndexedAccess` e
      `exactOptionalPropertyTypes`; `typescript` em `~6.0.3` conforme o ADR 0006;
      scripts `dev`, `build`, `typecheck`, `lint`, `test`; `engines` em Node
      `>=20.19`.
  - Commit: `chore: configurar TypeScript estrito, ESLint e scripts do projeto`
  - Cobre: CA-2
  - Testes: `npm run typecheck` e `npm run lint` em árvore vazia

- [x] **T-2** — Criar a estrutura de pastas da seção 4 do `CLAUDE.md` e o
      `.gitignore` de `src/generated/`.
  - Commit: `chore: criar a estrutura de pastas em camadas`
  - Cobre: —
  - Testes: —

### Bloco 2 — Infraestrutura

- [x] **T-3** — `docker-compose.yml` com Postgres 16 e Redis 7, volumes nomeados
      e `appendonly yes`, mais `.env.example` com todas as variáveis.
  - Commit: `chore(docker): adicionar Postgres e Redis com volumes nomeados`
  - Cobre: CA-1, RN-5, RN-7
  - Testes: manual, roteiro no fim deste arquivo

- [x] **T-4** — `config/env.ts`: schema Zod do ambiente, validado na importação,
      falhando na partida com a variável faltante nomeada.
  - Commit: `feat(config): validar variáveis de ambiente na inicialização`
  - Cobre: CA-12, RN-6
  - Testes: unitário — ambiente incompleto falha; ambiente válido tipa

- [x] **T-5** — Schema Prisma completo e migration inicial, com o índice único
      parcial do ADR 0003.
  - Commit: `feat(prisma): modelar o schema inicial com a constraint anti-overselling`
  - Cobre: CA-3, CA-4, CA-5, RN-4
  - Testes: integração por SQL direto — segunda reserva ativa no mesmo assento é
    rejeitada; reserva após `CANCELED`/`EXPIRED` é aceita

- [x] **T-6** — `lib/prisma.ts` e `lib/redis.ts`: instância única, conexão
      preguiçosa e desligamento limpo em `SIGTERM`/`SIGINT`.
  - Commit: `feat(lib): conectar Prisma e Redis com desligamento limpo`
  - Cobre: —
  - Testes: integração — conecta e desconecta sem deixar handle aberto

### Bloco 3 — Borda HTTP

- [x] **T-7** — `lib/logger.ts` com Pino e middleware de `requestId`.
  - Commit: `feat(shared): adicionar logger estruturado e correlação de requisição`
  - Cobre: parte do CA-10
  - Testes: unitário — o `requestId` da resposta aparece no log

- [x] **T-8** — Classes de erro de domínio, a hierarquia inteira de uma vez.
  - Commit: `feat(errors): definir as classes de erro de domínio`
  - Cobre: —
  - Testes: unitário — cada classe expõe `statusCode` e `code` corretos

- [x] **T-9** — Middleware de erro centralizado, com o formato único da spec e a
      distinção entre erro esperado e inesperado.
  - Commit: `feat(shared): tratar erros com formato de resposta único`
  - Cobre: CA-9, CA-10, RN-2, RN-3
  - Testes: integração — `AppError` mapeia status; erro inesperado vira 500 sem
    stack, com `requestId`; handler `async` que rejeita cai aqui (Express 5)

- [x] **T-10** — Middleware `validate` para body, query e params, respeitando o
      `req.query` somente leitura do Express 5.
  - Commit: `feat(shared): validar entrada com Zod nas bordas`
  - Cobre: CA-8, RN-1
  - Testes: integração — corpo inválido vira 400 com campos; JSON malformado vira
    `MALFORMED_JSON`; corpo válido chega tipado ao handler

- [x] **T-11** — `app.ts` e `server.ts`, com rota inexistente virando
      `ROUTE_NOT_FOUND` e desligamento gracioso.
  - Commit: `feat(app): montar a aplicação Express e o ciclo de vida do servidor`
  - Cobre: parte dos casos de erro
  - Testes: integração — rota inexistente retorna 404 no formato padrão

- [x] **T-12** — Módulo `health` com `GET /health`, reportando Postgres e Redis
      separadamente e tolerando Redis fora do ar.
  - Commit: `feat(health): expor o estado de Postgres e Redis`
  - Cobre: CA-6, CA-7
  - Testes: integração — tudo no ar responde 200; Redis fora responde degradado
    sem derrubar o processo

### Bloco 4 — Documentação

- [x] **T-13** — `docs/swagger.ts` com registro de schemas convertidos por
      `z.toJSONSchema`, servido em `/docs` e `/docs.json`.
  - Commit: `feat(docs): gerar o OpenAPI a partir dos schemas Zod`
  - Cobre: CA-11
  - Testes: integração — `/docs.json` é OpenAPI válido e todo schema do registro
    converte sem lançar

- [x] **T-14** — Atualizar o README com setup, Docker, migrations e execução dos
      testes.
  - Commit: `docs: documentar o setup e a execução do projeto`
  - Cobre: CA-1
  - Testes: seguir o próprio README em clone limpo

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-3, T-14 |
| CA-2 | T-1 |
| CA-3 | T-5 |
| CA-4 | T-5 |
| CA-5 | T-5 |
| CA-6 | T-12 |
| CA-7 | T-12 |
| CA-8 | T-10 |
| CA-9 | T-9 |
| CA-10 | T-7, T-9 |
| CA-11 | T-13 |
| CA-12 | T-4 |

Todos os doze critérios têm tarefa. Nenhuma tarefa existe sem critério ou sem
uma dependência declarada de outra que tenha.

## Roteiro manual de CA-1 e RN-7

```bash
cp .env.example .env          # preencher os valores
docker compose up -d
npm ci && npm run db:migrate
npm run dev                   # GET /health responde 200

# persistência: os dados sobrevivem ao ciclo
docker compose down
docker compose up -d
docker compose exec postgres \
  psql -U "$DB_USER" -d "$DB_NAME" -c 'select count(*) from "_prisma_migrations"'
docker compose exec redis redis-cli dbsize
```

O histórico de migrations e as chaves do Redis continuam lá depois do ciclo. A
verificação usa o que já existe no banco em vez do seed, que só nasce no Épico 2.

`docker compose down -v` apaga os volumes e é ação deliberada, nunca o fluxo
padrão.

## Definição de pronto do épico

- [x] Os doze critérios de aceite cobertos por teste automatizado, exceto CA-1,
      verificado pelo roteiro manual acima
- [x] `npm run lint` e `npm run typecheck` sem erro
- [x] `npm test` verde
- [x] `/docs` carrega o Swagger UI
- [x] Checkbox do Épico 1 marcado no backlog do `CLAUDE.md`
- [x] Nenhum segredo commitado; `.env.example` completo
