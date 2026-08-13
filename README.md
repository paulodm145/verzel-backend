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

> **Status:** backend completo. Os sete épicos do backlog estão entregues:
> autenticação com sessão revogável, catálogo externo, gestão de eventos,
> reserva protegida contra venda dupla, pagamento simulado, ingresso com QR
> assinado e validação na portaria.

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
| `GET /catalog/search` | Busca no catálogo externo (organizador) |
| `POST /events/:id/reservations` | Reserva de assento (cliente) |
| `POST /reservations/:id/payment` | Pagamento simulado |
| `GET /tickets/mine` · `GET /tickets/:code` | Ingressos e link compartilhável |
| `POST /gate/validate` | Validação na portaria |
| `POST /events` · `PATCH /events/:id` | Criação e edição pelo organizador dono |
| `POST /events/:id/publish` · `/cancel` | Transições de estado do evento |
| `GET /events` · `GET /events/:id` | Listagem e detalhe públicos |
| `GET /events/:id/seats` | Mapa de assentos, com o `id` que a reserva exige |

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

### Catálogo externo

O organizador cria eventos a partir de um catálogo externo — filmes do TMDb,
shows do Ticketmaster. As duas integrações ficam atrás de uma interface comum, e
a fábrica instancia **apenas o provedor cuja chave estiver no `.env`**
([ADR 0005](docs/adr/0005-adapter-para-catalogo-externo.md)):

- com `TMDB_API_KEY`, a busca traz filmes;
- com `TICKETMASTER_API_KEY`, traz shows;
- com as duas, traz os dois tipos, agregados;
- **sem nenhuma**, `GET /catalog/search` responde `200` com lista vazia, e o
  resto do sistema segue funcionando. Nada quebra por falta de chave.

Provedor que falha ou demora além do prazo sai do resultado sem derrubar os
demais, e cada busca fica 10 minutos no cache do Redis para não estourar a cota
gratuita durante uma avaliação.

Uma vez criado, o evento guarda os dados já normalizados: servi-lo **nunca**
chama a API externa de novo.

### Frontend em outra origem

A API responde CORS para as origens listadas em `CORS_ORIGINS` (padrão:
`http://localhost:5173` e `http://localhost:3001`). Não responde curinga, porque
as chamadas levam `Authorization`. O cabeçalho `Idempotency-Replayed` é exposto
explicitamente — sem isso o navegador o esconderia do JavaScript.

### Fluxo completo em cinco chamadas

Depois do seed, dá para percorrer o sistema inteiro sem frontend. O evento e o
ingresso semeados já estão lá; o `code` do ingresso aparece na saída do
`npm run db:seed`.

```bash
BASE=http://localhost:3000

# 1. Cliente entra
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"cliente2@verzel.test","password":"cliente123"}' \
  | jq -r .session.accessToken)

# 2. Encontra o evento publicado e um assento livre
EVENT=$(curl -s "$BASE/events" | jq -r '.items[0].id')
curl -s "$BASE/events/$EVENT" | jq '{title, availableSeatsCount}'

# 3. Reserva — com Idempotency-Key, porque duplo clique acontece
SEAT=$(curl -s "$BASE/events/$EVENT/seats" | jq -r '.items[] | select(.available) | .id' | head -1)
RES=$(curl -s -X POST $BASE/events/$EVENT/reservations \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" -d "{\"seatId\":\"$SEAT\"}" | jq -r .id)

# 4. Paga (simulado). Use "REFUSED" para ver o outro caminho
curl -s -X POST $BASE/reservations/$RES/payment \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"paymentMethod":"PIX","simulate":"APPROVED"}' | jq

# 5. Pega o ingresso e valida na portaria
CODE=$(curl -s $BASE/tickets/mine -H "authorization: Bearer $TOKEN" | jq -r '.items[0].code')

GATE=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"portaria@verzel.test","password":"portaria123"}' \
  | jq -r .session.accessToken)

curl -s -X POST $BASE/gate/validate -H "authorization: Bearer $GATE" \
  -H 'content-type: application/json' \
  -d "{\"code\":\"$CODE\",\"eventId\":\"$EVENT\"}" | jq
# → {"result":"VALID", ...}   e a segunda vez → {"result":"ALREADY_USED", ...}
```

### O que o seed deixa pronto

| Item | Detalhe |
| --- | --- |
| 4 usuários | Um organizador, dois clientes, uma portaria |
| 1 evento publicado | 30 assentos, com um já vendido |
| 1 ingresso `VALID` | Assento A1, pronto para validar na portaria |

O código do ingresso é impresso na saída do seed. O seed é idempotente e não
depende de rede: o evento nasce de dados fixos, e não de uma chamada ao catálogo
externo — seed que depende de internet falha justamente na máquina de quem está
avaliando.

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

## Decisões que valem a leitura

As dez decisões arquiteturais estão em [`docs/adr/`](docs/adr/), curtas e com as
alternativas descartadas. Quatro merecem destaque, porque são as que o desafio
pede para justificar:

**Nunca vender o mesmo lugar duas vezes** ([ADR 0003](docs/adr/0003-lock-redis-com-constraint-no-banco.md)).
Duas camadas com papéis diferentes: o lock no Redis evita a corrida, e um índice
único **parcial** no Postgres — restrito às reservas `PENDING` e `CONFIRMED` — é
quem garante. A diferença aparece no teste: vinte requisições simultâneas para o
mesmo assento **com o Redis derrubado** ainda produzem exatamente uma reserva.
O lock é otimização; o banco é a verdade.

**QR Code não falsificável** ([ADR 0004](docs/adr/0004-qrcode-com-assinatura-hmac.md)).
O conteúdo é `base64url(payload).assinatura`, com HMAC-SHA256. O payload viaja
legível de propósito: o que impede a forja não é escondê-lo, é a assinatura não
poder ser produzida sem o segredo. Por isso a portaria recusa um ingresso
inventado **sem consultar o banco**, o que importa quando a rede da entrada
oscila.

**Catálogo externo atrás de um Adapter** ([ADR 0005](docs/adr/0005-adapter-para-catalogo-externo.md)).
TMDb e Ticketmaster implementam a mesma interface, e a fábrica instancia apenas
o provedor cuja chave existe. O domínio nunca importa um adapter concreto.

**Senha com scrypt nativo** ([ADR 0009](docs/adr/0009-hash-de-senha-com-scrypt-nativo.md))
e **sessão com token de renovação opaco e rotativo**
([ADR 0010](docs/adr/0010-refresh-token-opaco-com-rotacao.md)). Sem dependência
para hash, e logout que invalida de verdade — reapresentar um token já usado
derruba todas as sessões do usuário, porque isso indica roubo.

## Testes

```bash
docker compose exec postgres createdb -U verzel verzel_test   # uma vez só
npm run db:test:setup
npm test
```

Mais de 300 testes. Os de integração usam **Postgres e Redis de verdade**, não
mocks — a constraint anti-overselling não teria como ser provada contra um banco
fingido, e foi exatamente um teste com dublê que escondeu um defeito real de
resiliência durante o desenvolvimento.

Os testes que mais importam:

| Arquivo | O que prova |
| --- | --- |
| `reservation-concurrency.test.ts` | 2 e 20 requisições simultâneas, com e sem Redis, sempre uma reserva |
| `reservation-constraint.test.ts` | A garantia está no banco: as escritas são SQL direto, sem passar pela aplicação |
| `qrcode.test.ts` | Forja recusada: payload trocado, assinatura trocada, outro segredo |
| `gate.test.ts` | Dois portões simultâneos liberam exatamente uma entrada |

## Uso de IA neste projeto

O projeto foi desenvolvido com **Claude Code** (Opus 5) em pareamento, e não como
gerador de código solto. O que isso significou na prática:

**O que a IA fez.** Escreveu a maior parte do código e dos testes, redigiu as
especificações, os planos e os ADRs a partir das decisões tomadas em conversa, e
executou a verificação — rodar a suíte, subir o servidor, derrubar o Redis,
conferir o comportamento real antes de afirmar que algo funcionava.

**O que foi decidido por mim.** A stack e as convenções (arquivo
[`CLAUDE.md`](CLAUDE.md), escrito antes de existir código), o fluxo
spec-driven, e cada uma das decisões de arquitetura: mapa de assentos em vez de
contador, constraint como garantia final, Adapter para o catálogo, scrypt em vez
de bcrypt, refresh token opaco com rotação. A IA apresentou alternativas com
trade-offs; a escolha e o registro em ADR foram meus.

**O que o processo pegou.** Cada épico virou um PR revisado antes do merge. A
revisão automatizada do Épico 1 encontrou nove problemas reais — o mais grave
era um `GET /health` que **travava** com o Redis fora do ar, enquanto o teste
correspondente passava porque usava um dublê que rejeitava, um caminho que o
código de produção nunca tomava. O defeito só apareceu ao derrubar o container
de verdade. Está corrigido, e o teste agora exercita a conexão real.

Também no desenvolvimento, dois testes foram reescritos por passarem **pelo
motivo errado**: um deles trocava uma variável de ambiente que já estava
memorizada, e portanto não testava a degradação que dizia testar.

A lição que fica: IA acelera muito a escrita, e não substitui a verificação. Um
teste verde é uma afirmação sobre o que ele exercita — não sobre o que o sistema
faz.

## Licença

[MIT](LICENSE).
