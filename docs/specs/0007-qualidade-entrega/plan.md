# Plan 0007 — Qualidade e entrega

Como a [spec 0007](spec.md) será implementada.

## Abordagem

O seed passa a montar um cenário completo, e não só usuários: um evento
publicado com trinta assentos, uma reserva confirmada e o ingresso emitido para
ela. É o que permite exercitar a portaria — o fluxo mais difícil de montar à mão
— na primeira execução.

Ele continua idempotente por `upsert`, e continua sem tocar a rede: o evento
nasce de dados fixos com a cara de um item de catálogo, e não de uma chamada ao
TMDb. Seed que depende de rede falha justamente na máquina de quem está
avaliando.

O README é reescrito com o fluxo ponta a ponta em `curl`, para que a avaliação
possa acontecer sem frontend.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/auth/auth.seed.ts` | alterar | Cenário completo |
| `README.md` | alterar | Setup, fluxo, decisões, uso de IA |
| `docs/specs/README.md`, `CLAUDE.md` | alterar | Status final |

## Estratégia de testes

| Tipo | Alvo | Critérios |
| --- | --- | --- |
| Integração | seed completo | CA-1, CA-2 |
| Integração | validação do ingresso semeado na portaria | CA-3 |
| Manual | seguir o README do zero | CA-4 |
