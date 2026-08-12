# Plataforma de Eventos e Ingressos — Backend

Backend do desafio **Elite Dev 2026**: uma plataforma de eventos e ingressos com
três papéis de usuário.

- **Organizador** cria eventos a partir de um catálogo externo, definindo data,
  local, capacidade e preço.
- **Cliente** navega pelos eventos publicados, reserva um lugar, paga (simulado) e
  recebe um ingresso com QR Code.
- **Portaria** valida o ingresso na entrada, distinguindo válido, inválido, já
  utilizado e evento errado.

Dois requisitos concentram o risco do sistema e recebem tratamento explícito:
**nunca vender o mesmo lugar duas vezes** ([ADR 0003](docs/adr/0003-lock-redis-com-constraint-no-banco.md))
e **QR Code não falsificável** ([ADR 0004](docs/adr/0004-qrcode-com-assinatura-hmac.md)).

> **Status:** em desenvolvimento. Fundação (Épico 1) e autenticação (Épico 2)
> entregues: a aplicação sobe, expõe `/health` e `/docs`, o banco já carrega a
> constraint anti-overselling, e os três papéis autenticam com sessão
> revogável. Catálogo, eventos, reserva e ingressos vêm a seguir.

## Como o projeto é construído

O desenvolvimento é **spec-driven**: cada épico do backlog começa por uma
especificação escrita, vira um plano técnico, depois um checklist de tarefas, e
só então código. Decisões arquiteturais são registradas como ADRs, com as
alternativas que foram descartadas.

O vocabulário vem do [spec-kit](https://github.com/github/spec-kit)
(constitution → spec → plan → tasks), adotado como markdown versionado, sem a
ferramenta — o projeto não precisa de mais um toolchain para escrever documento.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Stack, convenções de código, arquitetura em camadas e backlog |
| [`docs/constitution.md`](docs/constitution.md) | Princípios do projeto e critérios de decisão |
| [`docs/workflow.md`](docs/workflow.md) | Ciclo de branch, commit, PR e revisão |
| [`docs/adr/`](docs/adr/) | Decisões arquiteturais, com alternativas e consequências |
| [`docs/specs/`](docs/specs/) | Especificações por épico e roadmap |
| [`docs/templates/`](docs/templates/) | Modelos de spec, plan, tasks e ADR |

Quem quiser entender as escolhas técnicas antes do código deve começar pelos
[ADRs](docs/adr/): são cinco, curtos, e cobrem os pontos que o desafio pede para
justificar.

## Progresso

O estado de cada épico está no [roadmap de specs](docs/specs/README.md), e o
detalhe tarefa a tarefa no backlog do [`CLAUDE.md`](CLAUDE.md). Não é repetido
aqui de propósito: uma terceira cópia do mesmo status seria a primeira a
divergir.

## Setup

### Pré-requisitos

- **Node.js 20.19 ou superior** (o `engines` do `package.json` recusa versões
  anteriores; Prisma, ESLint e o client do Redis exigem esse piso).
- **Docker** com o plugin Compose, para Postgres e Redis.

### Passo a passo

```bash
cp .env.example .env    # preencha os valores: DB_PASSWORD e JWT_SECRET
docker compose up -d    # sobe Postgres 16 e Redis 7
npm ci                  # instala e roda `prisma generate` no postinstall
npm run db:migrate      # aplica as migrations no banco de desenvolvimento
npm run db:seed         # cria os usuários de teste
npm run dev             # http://localhost:3000
```

Com a aplicação no ar:

| Rota | O que responde |
| --- | --- |
| `GET /health` | Estado de Postgres e Redis, cada um separadamente |
| `GET /docs` | Swagger UI |
| `GET /docs.json` | Documento OpenAPI, gerado a partir dos schemas Zod |
| `POST /auth/register` · `/auth/login` | Cadastro de cliente e autenticação |
| `POST /auth/refresh` · `/auth/logout` | Renovação e encerramento da sessão |
| `GET /auth/me` | Perfil de quem apresenta o token |

O `/health` distingue os dois serviços porque eles não têm o mesmo peso: sem
Postgres não há serviço e a resposta é `error` com HTTP 503; sem Redis o sistema
perde lock e cache mas continua correto, então responde `degraded` com HTTP 200.
A razão está no [ADR 0003](docs/adr/0003-lock-redis-com-constraint-no-banco.md).

### Autenticação

Três papéis, com poderes diferentes: **organizador** publica eventos, **cliente**
compra ingressos, **portaria** valida quem entra.

O cadastro público (`POST /auth/register`) cria **apenas clientes**. Um `role`
enviado no corpo é ignorado — organizador e portaria só nascem do seed. Sem isso,
qualquer visitante se declararia portaria e marcaria ingressos alheios como
usados.

Login devolve **dois tokens**:

- **Token de acesso** — JWT de 15 minutos, mandado em `Authorization: Bearer`.
  É verificado por assinatura, sem consulta ao banco, e carrega o papel. Curto
  porque não há como revogá-lo.
- **Token de renovação** — 7 dias, opaco, e o banco guarda só o SHA-256 dele.
  Vale **uma única vez**: renovar troca o token.

Reapresentar um token de renovação já usado derruba **todas** as sessões daquele
usuário. Isso é deliberado: um token que reaparece depois de rotacionado indica
roubo, e nesse cenário é melhor deslogar o dono junto com o ladrão do que deixar
os dois dentro. O efeito colateral aceito é que um cliente que repita a chamada
de renovação por falha de rede também cai. O raciocínio inteiro está no
[ADR 0010](docs/adr/0010-refresh-token-opaco-com-rotacao.md).

Senhas são guardadas com **scrypt** do `node:crypto`, sem dependência externa,
com sal por usuário e os parâmetros de custo dentro do próprio hash
([ADR 0009](docs/adr/0009-hash-de-senha-com-scrypt-nativo.md)).

### Credenciais de teste

Criadas por `npm run db:seed`. São públicas de propósito — servem para avaliar o
projeto, e o seed nunca roda contra produção.

| Papel | E-mail | Senha |
| --- | --- | --- |
| `ORGANIZER` | `organizador@verzel.test` | `organizador123` |
| `CUSTOMER` | `cliente1@verzel.test` | `cliente123` |
| `CUSTOMER` | `cliente2@verzel.test` | `cliente123` |
| `GATE` | `portaria@verzel.test` | `portaria123` |

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"portaria@verzel.test","password":"portaria123"}'
```

O `/docs` traz esses mesmos exemplos prontos em `POST /auth/login`, para entrar
em cada papel sem sair do navegador. O seed é idempotente: rodar de novo não
duplica conta nem reescreve senha.

### Variáveis de ambiente

O [`.env.example`](.env.example) lista todas, comentadas. A aplicação valida o
ambiente com Zod na partida e **recusa iniciar** listando toda variável ausente
ou inválida — melhor falhar na primeira linha do que às três da manhã, com uma
`undefined` viajando pelo código.

O `JWT_SECRET` exige ao menos 32 caracteres, e não tem valor padrão: segredo de
assinatura com padrão silencioso é o que acaba em produção. Gere o seu com
`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.

Se a porta 5432 ou a 6379 já estiver ocupada na sua máquina, mude `DB_PORT` e
`REDIS_PORT` (a porta publicada no host) e reflita o novo valor em
`DATABASE_URL` e `REDIS_URL`. A porta dentro do container não muda.

### Testes

Os testes de integração usam Postgres e Redis **de verdade**, não mocks — a
constraint anti-overselling não teria como ser provada contra um banco fingido.
O banco de teste é separado do de desenvolvimento, no mesmo container:

```bash
docker compose exec postgres createdb -U verzel verzel_test   # uma vez só
npm run db:test:setup   # aplica as migrations em TEST_DATABASE_URL
npm test                # vitest run
```

`db:test:setup` recusa rodar se `TEST_DATABASE_URL` for igual a `DATABASE_URL`:
os testes truncam as tabelas, e apontar os dois para o mesmo banco apagaria o
ambiente de desenvolvimento.

Sem os containers no ar os testes **falham** em vez de passar silenciosamente.
É deliberado: um teste de integração que passa sem banco não está testando nada.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe em modo watch com `tsx` |
| `npm run build` / `npm start` | Compila para `dist/` e executa o build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint:fix` | ESLint flat config |
| `npm test` / `npm run test:watch` / `npm run test:coverage` | Vitest |
| `npm run db:migrate` | Cria e aplica migration em desenvolvimento |
| `npm run db:deploy` | Aplica migrations já existentes (produção/CI) |
| `npm run db:reset` | Recria o banco do zero e reaplica tudo |
| `npm run db:seed` | Cria os usuários de teste dos três papéis |
| `npm run db:generate` | Regenera o Prisma Client em `src/generated/` |

### Resetar o ambiente do zero

```bash
docker compose down -v   # apaga os volumes — destrutivo, e é para ser
docker compose up -d
npm run db:migrate
npm run db:seed
```

Sem o `-v`, `docker compose down` **preserva** os dados: os volumes são nomeados
(`postgres_data`, `redis_data`) e o Redis roda com `appendonly yes`. Perder dados
é sempre uma ação explícita, nunca o efeito colateral de parar os containers.

## Licença

[MIT](LICENSE).
