# CLAUDE.md — Plataforma de Eventos e Ingressos (Backend)

Este arquivo orienta o Claude Code durante o desenvolvimento do backend do desafio
"Elite Dev 2026". Leia por completo antes de gerar qualquer código. As decisões aqui
já foram tomadas — não proponha alternativas de stack ou arquitetura, apenas execute
seguindo estas diretrizes.

## 1. Contexto do projeto

Plataforma de eventos e ingressos com três papéis de usuário:

- **Organizador**: cria e gerencia eventos a partir de um catálogo externo (Ticketmaster
  Discovery ou TMDb), define data, local, capacidade e preço.
- **Cliente**: navega pelos eventos publicados, reserva um lugar, paga (simulado),
  recebe um ingresso com QR Code e pode compartilhá-lo via link.
- **Portaria**: valida o ingresso na entrada (leitura de QR ou digitação manual do código),
  com retorno claro: válido, inválido, já utilizado ou evento errado.

Os dois pontos mais sensíveis do sistema, que devem receber atenção redobrada:

1. **Nunca vender o mesmo lugar duas vezes** (garantia de concorrência na reserva).
2. **QR Code do ingresso não pode ser forjado** (integridade verificável).

## 2. Stack técnica

- **Runtime**: Node.js (LTS) + TypeScript em modo estrito (`strict: true` no tsconfig,
  sem `any` implícito, sem `// @ts-ignore` sem justificativa em comentário).
- **Framework**: Express.
- **Validação**: Zod em todos os limites de entrada (body, query, params). Nunca confiar
  em dado não validado dentro de um service.
- **ORM**: Prisma + PostgreSQL.
- **Cache / locks / idempotência**: Redis.
- **Autenticação**: JWT (access token curto + refresh token), com claim de `role`
  (`ORGANIZER`, `CUSTOMER`, `GATE`).
- **Documentação de API**: Swagger (OpenAPI), gerado a partir de anotações ou de um
  schema centralizado — decida uma abordagem e mantenha consistente em todo o projeto.
- **Testes**: testes automatizados (unitários nos services e de integração nas rotas
  críticas — reserva, pagamento, validação de ingresso).
- **Chamadas HTTP externas**: usar `fetch` nativo do Node. Não adicionar `axios` nem
  outra lib de HTTP client.
- **Dependências**: antes de instalar qualquer pacote novo, avaliar se dá para resolver
  com o que já está no stack. Evitar dependência desnecessária.

## 3. Convenções de código

- **Idioma**: código, nomes de variáveis, funções, classes, tabelas e colunas em inglês.
  Comentários e mensagens de commit em português. Nunca misturar os dois dentro do mesmo
  identificador (nada de `getIngressoById` ou `criar_ticket`).
- **Nomenclatura descritiva**: evitar abreviações obscuras. Preferir `availableSeatsCount`
  a `availSeats` ou `qtd`.
- **Clean Code**: funções pequenas, uma responsabilidade por função, early return em vez
  de aninhamento excessivo de `if`.
- **Paginação**: sempre `skip` e `take` (alinhado nativamente com a API do Prisma).
- **Camadas**: ver seção 4. Regra prática: se o controller for chamar lógica que é
  apenas "buscar/salvar sem regra de negócio", pode chamar o repository diretamente,
  sem criar um service vazio só para repassar a chamada (evita over-engineering /
  code smell de camada anêmica). Qualquer coisa com regra de negócio, orquestração,
  validação de estado ou side-effect (ex.: reservar assento, processar pagamento,
  validar ingresso) passa obrigatoriamente por um service.

## 4. Arquitetura em camadas

```
src/
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.routes.ts
      auth.schema.ts        (Zod schemas de entrada/saída)
    events/
      events.controller.ts
      events.service.ts
      events.repository.ts
      events.routes.ts
      events.schema.ts
    catalog/                (integração com Ticketmaster/TMDb)
      catalog.service.ts
      catalog.client.ts
    reservations/
      reservations.controller.ts
      reservations.service.ts
      reservations.repository.ts
      reservations.routes.ts
      reservations.schema.ts
    payments/
      payments.controller.ts
      payments.service.ts
      payments.routes.ts
    tickets/
      tickets.controller.ts
      tickets.service.ts
      tickets.repository.ts
      tickets.routes.ts
      qrcode.service.ts      (geração e verificação de assinatura do QR)
    gate/
      gate.controller.ts
      gate.service.ts
      gate.routes.ts
  shared/
    middlewares/             (auth, error handler, role guard, validate)
    lib/
      prisma.ts
      redis.ts
      logger.ts
    errors/                  (classes de erro de domínio: NotFoundError, ConflictError...)
    config/
  tests/
    unit/
    integration/
  docs/
    swagger.ts
```

Fluxo de dependência: `routes -> controller -> service -> repository -> prisma`.
Controller nunca acessa Prisma diretamente. Repository nunca contém regra de negócio.

## 5. Modelagem de dados (visão geral do schema Prisma)

Entidades principais — ajuste nomes/campos conforme necessário, mas mantenha o
espírito abaixo:

- `User` (id, name, email, passwordHash, role: ORGANIZER | CUSTOMER | GATE, createdAt)
- `Event` (id, organizerId, sourceType: SHOW | MOVIE, externalId — id vindo da API
  externa, title, date, venue, capacity, price, status: DRAFT | PUBLISHED | CANCELED)
- `Seat` (id, eventId, label, status: AVAILABLE | RESERVED | SOLD) — usar apenas se
  optar por mapa de assentos. Se optar por "pista" (quantidade), controlar via contador
  de `capacity` vs. `soldCount` no próprio `Event`, com lock para evitar overselling.
- `Reservation` (id, eventId, customerId, seatId opcional, quantity opcional, status:
  PENDING | CONFIRMED | EXPIRED | CANCELED, expiresAt)
- `Payment` (id, reservationId, status: APPROVED | REFUSED, simulatedAt)
- `Ticket` (id, reservationId, code — código único, qrSignature — assinatura HMAC,
  status: VALID | USED, usedAt, usedByGateUserId)

Constraints importantes a declarar no schema:

- `Seat`: unique constraint composta em `(eventId, id)` já garantida por FK; o campo
  crítico é impedir duas reservas `CONFIRMED`/`PENDING-não-expirada` para o mesmo
  `seatId` — resolver com unique index em `Reservation` para `seatId` quando status
  ativo (ver seção 6).
- `Ticket.code`: `@unique`.

## 6. Idempotência e concorrência na reserva de ingressos

Este é o ponto mais avaliado do desafio — trate com cuidado.

**Estratégia em duas camadas:**

1. **Lock distribuído no Redis** (`SET key value NX PX <ttl>`) usando uma chave
   determinística por assento (`lock:seat:{eventId}:{seatId}`) ou, no modelo de pista,
   por evento (`lock:event:{eventId}:capacity`). O lock evita que duas requisições
   simultâneas cheguem a checar disponibilidade e reservar ao mesmo tempo (race
   condition clássica de "check-then-act").
2. **Constraint de banco como garantia final** (fonte de verdade): mesmo com o lock,
   a escrita no Postgres deve ser protegida por uma constraint que rejeite duplicidade
   — por exemplo, um unique index parcial em `Reservation (seatId)` filtrando apenas
   status ativos (`PENDING`, `CONFIRMED`), ou uma transação com `SELECT ... FOR UPDATE`
   no assento antes de confirmar. O Redis lock é otimização de concorrência; o banco é
   quem garante integridade mesmo se o lock falhar (ex.: Redis indisponível).

**Idempotência da requisição de compra**: aceitar um `Idempotency-Key` no header da
rota de criação de reserva/pagamento. Armazenar no Redis (`idempotency:{key}` com TTL)
o resultado da primeira execução; se a mesma chave chegar de novo, retornar a resposta
already-processed em vez de duplicar a reserva. Isso cobre retry de rede/duplo clique
no front, cenário comum em fluxo de pagamento.

**Reserva com expiração**: ao criar uma `Reservation PENDING`, definir `expiresAt`
(ex.: 10 minutos) e liberar o assento se o pagamento não for confirmado a tempo (job
ou verificação lazy na próxima tentativa de reserva do mesmo assento).

## 7. Integridade do QR Code

O QR Code não deve ser um simples UUID — precisa ser **verificável sem consulta prévia
ao banco** (a portaria pode estar em conectividade instável) e **não forjável**.

**Abordagem**: o conteúdo do QR é um payload assinado, no formato:

```
payload = { ticketId, eventId, code }
signature = HMAC-SHA256(JSON.stringify(payload), TICKET_SECRET)
qrContent = base64url(payload) + "." + signature
```

- `TICKET_SECRET` fica em variável de ambiente, nunca no código.
- Na portaria, a validação faz duas checagens em sequência: (1) recalcula o HMAC e
  compara com a assinatura recebida — se não bater, retorna `INVALID` sem nem tocar
  no banco; (2) se a assinatura for válida, consulta o `Ticket` no banco pelo `code`
  para checar `eventId` correto e status (`VALID` vs `USED`), e só então marca como
  `USED` de forma atômica (`UPDATE ... WHERE status = 'VALID'` retornando linhas
  afetadas — se zero linhas, outro processo já validou primeiro: retorna `already used`).
- Essa checagem atômica no update evita que dois leitores de portaria validem o mesmo
  ingresso ao mesmo tempo.

Documente essa decisão no README do projeto final — é exatamente o tipo de escolha que
o desafio pede para justificar.

## 8. Autenticação e papéis

- JWT com claim `role`. Middleware `requireRole(...roles)` reutilizável nas rotas.
- Rotas de portaria (`/gate/*`) só acessíveis por usuários `GATE`.
- Rotas de gestão de evento (`POST/PUT /events`) só por `ORGANIZER`, e apenas sobre
  os próprios eventos (checar `organizerId` no service, não confiar em id vindo do
  client).
- Não implementar recuperação de senha (fora do escopo, conforme o PDF).

## 9. Integração com API externa (catálogo) — padrão Adapter

O PDF cita duas APIs possíveis (Ticketmaster Discovery e TMDb). Para não acoplar o
resto do sistema aos detalhes de nenhuma delas e permitir trocar ou adicionar uma
fonte sem retrabalho, isolar a integração atrás de uma interface comum (Adapter).

**Estrutura:**

```
modules/catalog/
  catalog.types.ts          (contrato comum: CatalogItem, CatalogSearchParams)
  catalog.port.ts            (interface CatalogProvider)
  adapters/
    ticketmaster.adapter.ts  (implementa CatalogProvider chamando Ticketmaster)
    tmdb.adapter.ts           (implementa CatalogProvider chamando TMDb)
  catalog.service.ts          (depende só da interface CatalogProvider, nunca de um
                                adapter específico)
  catalog.factory.ts          (decide, por config/env, qual(is) adapter(s) instanciar)
```

- `CatalogProvider` define um contrato único, por exemplo `search(query, pagination):
  Promise<CatalogItem[]>` e `getById(externalId): Promise<CatalogItem | null>`, com
  `CatalogItem` já normalizado (`externalId`, `title`, `date`, `imageUrl`, `sourceType:
  SHOW | MOVIE`, `raw` opcional para o payload original).
- Cada adapter (`ticketmaster.adapter.ts`, `tmdb.adapter.ts`) traduz a resposta bruta
  da respectiva API para `CatalogItem`. Toda particularidade de formato, paginação ou
  nomenclatura de campo fica isolada dentro do adapter — o resto do sistema não sabe
  que a API mudou.
- `catalog.service.ts` (e todo o restante do domínio) depende apenas de
  `CatalogProvider`, nunca importa um adapter diretamente. Trocar de API, ou suportar
  as duas ao mesmo tempo, é questão de configuração (`catalog.factory.ts`), não de
  reescrever regra de negócio.
- Se optar por usar as duas APIs simultaneamente, o service pode agregar os resultados
  de múltiplos adapters (ex.: `providers.flatMap(p => p.search(...))`), mantendo o
  mesmo contrato de saída.
- Cada adapter usa `fetch`, com tratamento de erro e timeout próprios. Resultados de
  busca são cacheados no Redis por um TTL curto (ex.: 5–10 min) para não estourar rate
  limit da API externa durante os testes de avaliação.
- Guardar no `Event` apenas os dados já normalizados (`externalId`, `sourceType`,
  `title`, imagem, etc.) — o evento publicado nunca depende de uma nova chamada à API
  externa para ser servido.

Documente essa decisão no README: é um bom exemplo de escolha arquitetural que vale a
pena justificar no desafio.

## 10. Infraestrutura e persistência de dados

Postgres e Redis devem rodar via Docker Compose, com dados persistidos em volumes
nomeados — os dados não podem se perder quando o container parar ou for recriado.

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--appendonly", "yes"]

volumes:
  postgres_data:
  redis_data:
```

Pontos importantes:

- Volumes nomeados (`postgres_data`, `redis_data`), não anônimos e não montados só em
  `tmpfs` — `docker compose down` não pode apagar os dados (apenas `docker compose down
  -v` apaga, e isso deve ser uma ação explícita, nunca o fluxo padrão de uso).
- Redis com `appendonly yes` para persistir os dados usados em locks/idempotência e
  cache entre reinicializações (o cache de catálogo pode ser perdido sem problema, mas
  vale manter a mesma configuração de persistência para simplicidade).
- Documentar no README como subir (`docker compose up -d`), como resetar o ambiente do
  zero quando necessário (`docker compose down -v` + `prisma migrate reset`), e como
  rodar as migrations/seed contra o banco do container.

## 11. Documentação Swagger

- Expor em `/docs`.
- Documentar todos os endpoints com request/response schemas derivados dos schemas Zod
  (evitar duplicar a definição manualmente — usar uma lib de bridge Zod→OpenAPI se fizer
  sentido, ou manter os dois em arquivos próximos e sincronizados).
- Incluir exemplos de payload para os três papéis.

## 12. Testes automatizados

Priorizar cobertura nos pontos críticos, não 100% do projeto:

- Unitário: `reservations.service` (concorrência simulada, expiração), `qrcode.service`
  (assinatura e verificação), `payments.service` (aprovação/recusa simulada).
- Integração: fluxo completo reserva → pagamento → emissão de ingresso → validação na
  portaria, incluindo o caso de tentar validar o mesmo ingresso duas vezes.

## 13. Dados semeados (seed)

O script de seed (`prisma/seed.ts`) deve criar:

- 1 organizador
- 2 clientes
- 1 usuário de portaria
- ao menos 1 evento publicado com ingressos/assentos disponíveis
- credenciais de todos os usuários de teste documentadas no README

## 14. Backlog

### Épico 1 — Fundação
- [x] Setup do projeto (TypeScript strict, ESLint, estrutura de pastas)
- [x] Configuração Prisma + schema inicial + migrations
- [x] Configuração Redis
- [x] Middleware de erro centralizado + classes de erro de domínio
- [x] Middleware de validação Zod
- [x] Configuração Swagger base

### Épico 2 — Autenticação
- [x] Cadastro/login com hash de senha
- [x] Geração de access + refresh token
- [x] Middleware de autenticação e de role guard
- [x] Seed de usuários de teste

### Épico 3 — Catálogo e eventos
- [x] Client de integração com API externa (Ticketmaster/TMDb) + cache Redis
- [x] Endpoint de busca no catálogo (organizador)
- [x] CRUD de eventos (criar a partir do catálogo, editar, publicar, cancelar)
- [x] Endpoint público de listagem/busca de eventos (cliente)

### Épico 4 — Reserva e pagamento
- [ ] Modelagem de assentos ou capacidade por evento
- [ ] Endpoint de reserva com lock Redis + constraint de banco
- [ ] Expiração de reserva pendente
- [ ] Endpoint de pagamento simulado (aprovar/recusar) com Idempotency-Key
- [ ] Testes de concorrência na reserva

### Épico 5 — Ingressos
- [ ] Geração do ingresso com QR assinado (HMAC)
- [ ] Endpoint "meus ingressos" (cliente)
- [ ] Geração de link de compartilhamento do ingresso
- [ ] Endpoint de consulta de ingresso por link/código

### Épico 6 — Portaria
- [ ] Endpoint de validação de ingresso (código digitado ou payload de QR)
- [ ] Update atômico de status para evitar dupla validação
- [ ] Retornos claros: válido / inválido / já utilizado / evento errado

### Épico 7 — Qualidade e entrega
- [ ] Testes unitários e de integração dos fluxos críticos
- [ ] Seed completo de dados de teste
- [ ] README com setup, execução, e seção de uso de IA
- [ ] Revisão final de nomenclatura e camadas (clean code)

## 15. Regras de commit

Commits devem ser **atômicos** e **semânticos**. Seguir o padrão Conventional Commits:

```
<tipo>(<escopo opcional>): <descrição curta no imperativo, em português>
```

Tipos permitidos:

- `feat`: nova funcionalidade
- `fix`: correção de bug
- `refactor`: mudança de código sem alterar comportamento externo
- `test`: adição ou ajuste de testes
- `chore`: configuração, dependências, tooling
- `docs`: documentação (README, este arquivo, comentários relevantes)
- `perf`: melhoria de performance

Exemplos:

```
feat(reservations): adicionar lock no Redis para evitar overselling de assento
fix(gate): corrigir validação de ingresso já utilizado retornando status incorreto
refactor(catalog): extrair adapter do Ticketmaster da lógica do service
test(qrcode): cobrir verificação de assinatura HMAC inválida
chore(docker): adicionar volumes nomeados para persistência do Postgres e Redis
```

Regras práticas:

- **Atômico**: um commit representa uma única mudança logicamente completa (uma
  tarefa do backlog, ou uma fração dela se for grande). Não misturar `feat` com
  `refactor` não relacionado no mesmo commit. Não fazer commit de código que quebra o
  build ou os testes existentes.
- **Semântico**: a mensagem descreve o *porquê*/*o quê* de forma que dê para entender
  a evolução do projeto só lendo o `git log`, sem abrir o diff.
- Evitar commits genéricos como `ajustes`, `wip`, `correções diversas`.
- Está OK dividir uma única tarefa do backlog em vários commits (ex.: schema Zod,
  depois service, depois controller/rota, depois teste), desde que cada um faça
  sentido isoladamente.
- Nunca commitar `.env` nem segredos (`TICKET_SECRET`, JWT secret, credenciais de API
  externa) — usar `.env.example`.

## 16. Como o Claude Code deve trabalhar neste projeto

- Seguir o backlog acima na ordem dos épicos; dentro de um épico, pode paralelizar
  tarefas independentes.
- Antes de gerar código de um módulo, escrever primeiro os Zod schemas de entrada/saída
  daquele módulo.
- Cada tarefa concluída deve ter teste correspondente antes de ser considerada pronta
  (ao menos para os módulos das seções 6, 7 e 9).
- Seguir as regras de commit da seção 15 em todo o histórico — o desafio avalia o
  histórico de commits como parte do processo mostrado.
- Ao final, gerar/atualizar o README com: passo a passo de setup (Docker Compose para
  Postgres + Redis, incluindo os volumes de persistência), como rodar migrations e
  seed, como rodar os testes, credenciais de teste, e uma seção explicando o que foi
  feito com IA e o que foi decidido manualmente — em especial as decisões das seções
  6, 7 e 9 deste arquivo, que são as mais fáceis de mal-interpretar numa leitura
  rápida do código.
