# Plan 0004 — Reserva e pagamento

Como a [spec 0004](spec.md) será implementada.

## Abordagem

A ordem das camadas é a mensagem deste épico: **lock primeiro, constraint
sempre**. O lock no Redis evita que duas requisições cheguem juntas ao
"verificar e então gravar"; a constraint no Postgres é quem garante que, mesmo
sem lock, a segunda escrita não passa. A implementação trata a violação de
constraint como caminho esperado, com nome próprio — `ConflictError` — e não como
falha interna. É isso que faz o teste com Redis derrubado continuar verde.

Expiração é **preguiçosa**: antes de reservar um assento, as reservas `PENDING`
vencidas daquele assento são marcadas `EXPIRED`, dentro do mesmo lock. Um job
periódico resolveria o mesmo problema com mais peças em movimento — e a
verificação preguiçosa acontece exatamente quando importa, que é quando alguém
quer o lugar.

A idempotência é um middleware: a rota declara que é idempotente, e o middleware
cuida de gravar e reproduzir a resposta. Fora dele, service e controller não
sabem que ela existe.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/shared/lib/lock.ts` | criar | `withLock` sobre `SET NX PX`, degradando sem Redis |
| `src/shared/middlewares/idempotency.ts` | criar | Grava e reproduz resposta por `Idempotency-Key` |
| `src/modules/reservations/reservations.schema.ts` | criar | Zod de entrada e saída |
| `src/modules/reservations/reservations.repository.ts` | criar | Prisma; traduz violação de constraint |
| `src/modules/reservations/reservations.service.ts` | criar | Lock, expiração preguiçosa, regras de dono |
| `src/modules/reservations/reservations.controller.ts` · `.routes.ts` | criar | Borda HTTP |
| `src/modules/payments/payments.service.ts` | criar | Pagamento simulado e confirmação |
| `src/modules/payments/payments.controller.ts` · `.routes.ts` | criar | Borda HTTP |
| `src/shared/config/env.ts` | alterar | Prazos de reserva, lock e idempotência |
| `src/app.ts`, `src/docs/swagger.ts` | alterar | Montagem e documentação |

Sem migration: `Reservation` e `Payment` vêm da spec 0001, com o índice único
parcial que é a garantia final.

## Contratos

### Endpoints

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| `POST` | `/events/:id/reservations` | `CUSTOMER` | Reserva um assento. Aceita `Idempotency-Key` |
| `GET` | `/reservations/mine` | `CUSTOMER` | Minhas reservas |
| `DELETE` | `/reservations/:id` | `CUSTOMER` dono | Cancela a própria reserva |
| `POST` | `/reservations/:id/payment` | `CUSTOMER` dono | Pagamento simulado. Aceita `Idempotency-Key` |

### Schemas

```ts
createReservationSchema = z.object({ seatId: z.uuid() });

payReservationSchema = z.object({
  paymentMethod: z.enum(["CREDIT_CARD", "PIX"]).default("CREDIT_CARD"),
  // Simulação explícita: é o que permite demonstrar recusa sem gateway real
  simulate: z.enum(["APPROVED", "REFUSED"]).default("APPROVED"),
});
```

### O lock

```ts
withLock(key: string, ttlMs: number, work: () => Promise<T>): Promise<T>
```

Chave determinística por assento: `lock:seat:{eventId}:{seatId}`. Quem não
adquire recebe `ConflictError` sem esperar — fila de espera em requisição HTTP só
transfere o congestionamento.

Com o Redis fora, `withLock` **executa o trabalho assim mesmo** e registra o
fato. É a decisão central do ADR 0003: o lock é otimização, e recusar toda venda
por causa do cache seria transformar uma degradação em indisponibilidade.

### A idempotência

`idempotent(scope)` lê o cabeçalho `Idempotency-Key`. Sem cabeçalho, segue
adiante. Com cabeçalho, procura `idempotency:{scope}:{userId}:{key}` no Redis:
achou, responde o corpo e o status gravados, com `Idempotency-Replayed: true`;
não achou, deixa passar e grava a resposta se ela for de sucesso.

A chave inclui o `userId` para que a chave de um cliente não colida com a de
outro. Só respostas de sucesso são gravadas: repetir um erro transitório deve
poder ser tentado de novo.

## Modelo de dados

`Payment.reservationId` é único, então cada reserva tem no máximo um registro de
pagamento: a tentativa recusada é sobrescrita pela seguinte. É simplificação
consciente de pagamento simulado — histórico de tentativas não é o que o desafio
avalia, e a alternativa exigiria migration para um modelo que ninguém vai usar.

## Estratégia de testes

| Tipo | Alvo | Critérios |
| --- | --- | --- |
| Integração | 2 e 20 requisições simultâneas, banco real | CA-2, CA-3 |
| Integração | concorrência com lock desligado | CA-4, RN-2 |
| Integração | reserva vencida liberando o assento | CA-7 |
| Integração | idempotência de reserva e de pagamento | CA-8, CA-11 |
| Unitário | `reservations.service` com repositório falso | CA-5, CA-6, CA-12, CA-13, CA-15 |
| Unitário | `payments.service` | CA-9, CA-10 |
| Integração | rotas | CA-1, CA-13, CA-14 |

O teste de concorrência é o mais importante do projeto e roda contra **Postgres
de verdade**: com repositório em memória ele provaria apenas que o JavaScript é
single-threaded, o que não é a pergunta.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Violação de constraint tratada como erro 500 | O repositório traduz `P2002` em `ConflictError`; há teste |
| Timeout de 5 s do node-redis derruba o lock | `withLock` captura e segue sem lock, como se o Redis estivesse fora |
| Expiração preguiçosa nunca roda em assento parado | Aceito: assento que ninguém quer não precisa ser liberado com pressa; a reserva vencida já não confirma |
| Cliente repete pagamento sem `Idempotency-Key` | O service recusa pagar reserva já `CONFIRMED`, então a segunda cobrança não acontece |
