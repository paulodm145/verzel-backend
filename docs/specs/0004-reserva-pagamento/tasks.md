# Tasks 0004 — Reserva e pagamento

Quebra do [plan 0004](plan.md) em commits atômicos.

## Tarefas

- [x] **T-1** — `shared/lib/lock.ts` e as variáveis de prazo no ambiente.
  - Commit: `feat(shared): adicionar lock distribuído com degradação sem Redis`
  - Cobre: RN-2
  - Testes: integração — dois `withLock` concorrentes não se sobrepõem; com
    Redis fora, o trabalho roda assim mesmo

- [x] **T-2** — `shared/middlewares/idempotency.ts`.
  - Commit: `feat(shared): reproduzir resposta por Idempotency-Key`
  - Cobre: RN-5, RN-6
  - Testes: integração — segunda chamada devolve a primeira resposta; sem
    cabeçalho processa normal; Redis fora não bloqueia

- [x] **T-3** — Schemas e repositório de reserva, traduzindo violação de
      constraint em `ConflictError`.
  - Commit: `feat(reservations): persistir reserva traduzindo a constraint`
  - Cobre: RN-1
  - Testes: integração — segunda reserva ativa no mesmo assento vira 409

- [x] **T-4** — `reservations.service.ts`: lock, expiração preguiçosa, dono,
      cancelamento.
  - Commit: `feat(reservations): reservar assento com lock e expiração`
  - Cobre: CA-5, CA-6, CA-7, CA-12, CA-13, CA-15
  - Testes: unitário com repositório falso

- [x] **T-5** — Rotas de reserva e montagem.
  - Commit: `feat(reservations): expor as rotas de reserva`
  - Cobre: CA-1, CA-13, CA-14
  - Testes: integração

- [x] **T-6** — `payments.service.ts` e rota de pagamento.
  - Commit: `feat(payments): processar pagamento simulado e confirmar a reserva`
  - Cobre: CA-9, CA-10, CA-11, CA-12
  - Testes: unitário e integração

- [x] **T-7** — Testes de concorrência contra Postgres real, com e sem Redis.
  - Commit: `test(reservations): provar que o assento não vende duas vezes`
  - Cobre: CA-2, CA-3, CA-4, CA-8
  - Testes: 2 e 20 requisições simultâneas; lock desligado

- [x] **T-8** — Documentar reserva e pagamento no OpenAPI, incluindo o cabeçalho
      de idempotência.
  - Commit: `feat(docs): documentar reserva e pagamento`
  - Cobre: —
  - Testes: integração — rotas no `/docs.json`

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-5 |
| CA-2 | T-7 |
| CA-3 | T-7 |
| CA-4 | T-7 |
| CA-5 | T-4 |
| CA-6 | T-4 |
| CA-7 | T-4, T-7 |
| CA-8 | T-2, T-7 |
| CA-9 | T-6 |
| CA-10 | T-6 |
| CA-11 | T-6 |
| CA-12 | T-4, T-6 |
| CA-13 | T-4, T-5 |
| CA-14 | T-5 |
| CA-15 | T-4 |

## Definição de pronto do épico

- [x] Os quinze critérios cobertos por teste automatizado
- [x] O teste de concorrência passa com o Redis derrubado
- [x] `npm run lint`, `npm run typecheck` e `npm test` sem erro
- [x] Rotas novas no `/docs`
- [x] Checkbox do Épico 4 no backlog, e status no roadmap
