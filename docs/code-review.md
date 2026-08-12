# Code review — backend completo

Revisão dos sete épicos já mergeados na `main`, em 2026-08-12. Cada item traz
**onde**, **por que importa** e **o que fazer**, na ordem em que devem ser
atacados.

Contexto que orienta a priorização: o frontend ainda será construído, e o prazo
é curto. Os itens P0 bloqueiam o frontend; os P1 são falhas reais de
comportamento; P2 e P3 são qualidade e podem ficar de fora se o tempo apertar.

| Prioridade | Itens | Custo estimado |
| --- | --- | --- |
| P0 — bloqueia o frontend | 2 | ~1h |
| P1 — falha real | 4 | ~2h |
| P2 — consistência e robustez | 5 | ~2h |
| P3 — polimento | 4 | opcional |

---

## P0 — Bloqueia o frontend

### 1. Não existe endpoint para listar os assentos de um evento

**Onde:** `src/modules/events/events.routes.ts` — nenhuma rota expõe assentos;
`events.service.ts:195` (`detail`) devolve apenas `availableSeatsCount`.

**Por que importa:** o frontend precisa desenhar o mapa de assentos e mandar um
`seatId` para `POST /events/:id/reservations`. Hoje **não há como obter esse
id pela API**. Isso não é hipótese: no teste manual de ponta a ponta eu tive que
consultar o Postgres direto para descobrir um `seatId`, o que o frontend
obviamente não pode fazer.

É a decisão do [ADR 0002](adr/0002-usar-mapa-de-assentos.md) pela metade: o mapa
de assentos existe no banco e não é servido.

**O que fazer:** criar `GET /events/:id/seats`, público, devolvendo cada assento
com `id`, `label` e disponibilidade derivada da ausência de reserva ativa —
mesma regra do `countAvailableSeats`, que já existe em
`events.repository.ts`. Cuidado para não fazer N+1: uma consulta só, com
`reservations: { none: { status: { in: ["PENDING","CONFIRMED"] } } }` ou um
`groupBy`.

Sugestão de contrato:

```jsonc
// GET /events/{id}/seats
{ "items": [ { "id": "uuid", "label": "A1", "available": true } ], "total": 30 }
```

### 2. CORS não está configurado

**Onde:** `src/app.ts:29` — a aplicação monta `express.json` e nada de CORS.

**Por que importa:** o frontend rodará em outra origem (`localhost:5173` ou
similar). Sem cabeçalho `Access-Control-Allow-Origin`, **toda** requisição do
navegador falha — inclusive o preflight `OPTIONS` das chamadas com
`Authorization`. É a primeira parede que o frontend vai bater, e o erro no
console não aponta para o backend de forma óbvia.

**O que fazer:** middleware próprio (poucas linhas, sem dependência) ou o pacote
`cors`. Origem permitida deve vir do ambiente — `CORS_ORIGIN`, com padrão de
desenvolvimento — e não ser `*`, já que a API usa `Authorization`. Precisa
responder ao `OPTIONS` e expor o cabeçalho `Idempotency-Replayed`, que o
frontend lê.

---

## P1 — Falhas reais de comportamento

### 3. Dá para pagar reserva de evento cancelado

**Onde:** `src/modules/payments/payments.service.ts:32` — o `pay` valida dono,
status da reserva e prazo, mas **nunca consulta o evento**.

**Por que importa:** o organizador cancela o evento, e o cliente com reserva
`PENDING` ainda consegue pagar. O pagamento é aprovado, o ingresso é emitido, e
a portaria depois recusa com `INVALID — Este evento foi cancelado`. O cliente
pagou por um ingresso que já nasce sem valor. É o pior caminho possível: o
sistema cobra e depois nega a entrada.

**O que fazer:** carregar o estado do evento junto da reserva e recusar com
`409` quando o evento não estiver `PUBLISHED`. Já existe
`ReservationsRepository.findEventState` — dá para reaproveitar, sem consulta
nova ao schema.

**Teste que falta:** pagar reserva de evento cancelado responde 409 e não emite
ingresso.

### 4. Logout revoga token de sessão alheia

**Onde:** `src/modules/auth/auth.service.ts:168` — `logout` busca o token pelo
hash e revoga, **sem comparar** o `userId` do token com o do solicitante.

**Por que importa:** a rota exige autenticação, mas qualquer usuário autenticado
que conheça um refresh token de outra pessoa consegue derrubar a sessão dela. O
token é secreto, então o impacto é limitado — mas a checagem de dono está
presente em toda operação equivalente do sistema (`cancel`, `pay`, `detail`), e
a ausência aqui é inconsistência, não escolha.

**O que fazer:** receber o `customerId` autenticado no `logout` e ignorar
silenciosamente (ou 403) quando o token pertencer a outro usuário. Manter o
silêncio para token inexistente, que é comportamento correto e já testado.

### 5. Mudança de capacidade não é atômica com a troca do mapa

**Onde:** `src/modules/events/events.service.ts:139` — `repository.update`
grava a capacidade nova e, **depois**, `replaceSeats` recria os assentos, em
duas operações independentes.

**Por que importa:** falha entre as duas deixa o evento dizendo `capacity: 50`
com 10 assentos no banco. A listagem pública mostra uma capacidade que não
existe, e o cliente vê "50 lugares" num evento onde só 10 podem ser reservados.
O Épico 3 acertou isso na **criação** (evento e mapa nascem na mesma transação);
a edição ficou de fora.

**O que fazer:** mover as duas escritas para dentro de uma transação no
repositório — algo como `updateWithSeats(eventId, changes, capacity)`. O
`replaceSeats` já roda em transação; falta unir com o `update`.

### 6. Idempotency-Key não considera o corpo da requisição

**Onde:** `src/shared/middlewares/idempotency.ts:38` — a chave de
armazenamento é `idempotency:{escopo}:{usuário}:{chave}`, sem nada do payload.

**Por que importa:** se o frontend reaproveitar a mesma chave para requisições
**diferentes** — reservar o assento A1 e, logo depois, o A2 — a segunda recebe a
resposta da primeira e o usuário acredita ter reservado o A2 quando reservou o
A1. É uma falha silenciosa: ninguém vê erro, e o dado exibido está errado.

O padrão da indústria (Stripe, por exemplo) resolve comparando o corpo: chave
repetida com payload diferente responde erro, em vez de reproduzir.

**O que fazer:** guardar junto o hash SHA-256 do corpo. Chave igual com corpo
igual reproduz (comportamento atual); chave igual com corpo diferente responde
`422` ou `409` explicando o conflito.

---

## P2 — Consistência e robustez

### 7. `GET /gate/tickets/:code` ignora evento cancelado e evento errado

**Onde:** `src/modules/gate/gate.service.ts:107` — o `inspect` só olha
`ticket.status`, enquanto o `validate` distingue os quatro resultados.

**Por que importa:** a portaria consulta um ingresso antes de liberar a fila e
recebe `VALID` para um ingresso de outro evento, ou de evento cancelado. Depois
valida e recebe `WRONG_EVENT`. Duas respostas diferentes para o mesmo ingresso,
no mesmo balcão.

**O que fazer:** aceitar `eventId` opcional na consulta e aplicar as mesmas
regras do `validate`, sem marcar uso. Extrair a decisão para uma função pura
compartilhada pelos dois caminhos.

### 8. Listas de reservas e ingressos não devolvem a paginação

**Onde:** `src/modules/reservations/reservations.routes.ts:77` e
`src/modules/tickets/tickets.routes.ts:23` devolvem `{ items, total }`,
enquanto `events.controller.ts:62` devolve `{ items, total, skip, take }`.

**Por que importa:** o frontend precisa saber a página atual para paginar. Como
os três endpoints aceitam `skip`/`take`, a diferença no retorno vira código
condicional do lado do cliente para nada.

**O que fazer:** uniformizar os três, ecoando `skip` e `take`.

### 9. Login sem proteção contra força bruta

**Onde:** `src/modules/auth/auth.routes.ts` — nenhuma limitação de tentativas.

**Por que importa:** o scrypt encarece o ataque offline, mas nada impede milhares
de tentativas online contra `POST /auth/login`. Com senhas de teste fracas e
públicas (documentadas no README), a demonstração fica trivialmente atacável.

**O que fazer:** contador no Redis por e-mail e por IP, com janela deslizante —
o `withLock` já mostra o padrão de degradar quando o Redis cai. Não adicionar
dependência: um `INCR` com `EXPIRE` resolve.

### 10. Reservas vencidas ficam `PENDING` para sempre em assento sem disputa

**Onde:** `src/modules/reservations/reservations.service.ts` — a expiração é
preguiçosa e só roda quando alguém tenta reservar aquele assento.

**Por que importa:** a correção não é afetada (pagar reserva vencida já responde
409), mas a tabela acumula reservas fantasma, o relatório do organizador mente
sobre o que está reservado, e `availableSeatsCount` fica **menor** que a
realidade — o evento parece mais cheio do que está.

**O que fazer:** uma varredura periódica simples (`setInterval` no `server.ts`,
com o índice `[status, expiresAt]` que já existe) ou um script `npm run
reservations:expire` documentado. Manter a expiração preguiçosa como está: ela é
o que garante correção; a varredura é higiene.

### 11. `RefreshToken` vencido nunca é apagado

**Onde:** nenhum código apaga; o índice `[expiresAt]` existe e não é usado.

**Por que importa:** a tabela cresce indefinidamente. Sem impacto em correção,
mas é o tipo de coisa que um revisor pergunta.

**O que fazer:** incluir na mesma varredura do item 10, apagando o que venceu há
mais de N dias.

---

## P3 — Polimento

### 12. Log não redige tokens

**Onde:** `src/shared/lib/logger.ts` — `redact` cobre `authorization`, `cookie`,
`password` e `passwordHash`, mas não `refreshToken`, `accessToken`, `qrContent`
nem `code` de ingresso.

**O que fazer:** acrescentar esses caminhos. Custo baixo, e evita que um log de
corpo de requisição vaze uma sessão inteira.

### 13. Chave de cache do catálogo não distingue os provedores ativos

**Onde:** `src/modules/catalog/catalog.service.ts` — a chave é
`catalog:search:{termo}:{página}`.

**O que fazer:** incluir os nomes dos provedores ativos na chave. Hoje, ligar a
chave do Ticketmaster serve resultado cacheado só do TMDb por até 10 minutos.

### 14. `Payment` guarda só a última tentativa

**Onde:** `prisma/schema.prisma` — `Payment.reservationId` é `@unique`, e o
repositório faz `upsert`.

**O que fazer:** decisão consciente registrada no plan 0004; **manter**. Se
sobrar tempo, virar histórico exige migration e não muda nada que o desafio
avalie. Fica aqui apenas para não parecer esquecimento.

### 15. Cancelamento de reserva confirmada não existe

**Onde:** `reservations.service.ts` — `cancel` recusa reserva `CONFIRMED`.

**O que fazer:** nada agora. Estorno é fluxo de negócio que o desafio não pede.
Registrado para responder à pergunta se ela vier na avaliação.

---

## O que a revisão **não** encontrou

Vale registrar, porque foi verificado e está correto:

- **Concorrência na reserva.** As duas camadas do
  [ADR 0003](adr/0003-lock-redis-com-constraint-no-banco.md) fazem o que
  prometem, inclusive com o Redis derrubado. Nada a corrigir.
- **Integridade do QR.** Assinatura conferida antes de qualquer consulta,
  comparação em tempo constante, e o teste de forja cobre payload trocado,
  assinatura trocada e outro segredo.
- **Marcação atômica na portaria.** `updateMany` com `status` no `where` e
  contagem de linhas; dois portões simultâneos liberam uma entrada só.
- **Vazamento de dados pessoais.** A visão pública do ingresso não traz o
  comprador, e há teste afirmando isso.
- **Camadas.** Nenhum controller acessa Prisma; nenhum repositório contém regra
  de negócio; o domínio não importa adapter concreto de catálogo.

---

## Ordem sugerida de execução

1. **Item 1 e 2** primeiro, hoje: sem eles o frontend não começa.
2. **Itens 3, 4, 5 e 6** em seguida: são as falhas que um avaliador atento
   encontra lendo o código.
3. **Itens 7 a 11** se o prazo permitir, na ordem listada.
4. **P3** só se sobrar tempo depois do frontend.

Cada item vira um commit `fix:` ou `feat:` próprio, com o teste que prova a
correção — os itens 3, 4, 5 e 6 têm teste faltando explicitamente indicado.
