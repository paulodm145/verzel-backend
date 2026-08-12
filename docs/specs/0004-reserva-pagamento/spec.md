# Spec 0004 — Reserva e pagamento

| | |
| --- | --- |
| **Épico** | 4 — Reserva e pagamento |
| **Branch** | `feat/0004-reserva-pagamento` |
| **Status** | approved |

## Problema

O cliente escolhe um lugar e paga. É aqui que mora o requisito que o desafio
trata como não negociável: **nunca vender o mesmo lugar duas vezes**.

Duas pessoas clicando no mesmo assento no mesmo instante é o caso normal, não a
exceção — é o que acontece quando os ingressos de um show esgotam em minutos. E
o mesmo cliente clicando duas vezes em "pagar", ou o navegador reenviando a
requisição depois de uma falha de rede, não pode gerar duas reservas nem duas
cobranças.

Reserva também não pode prender assento para sempre: quem reserva e some deixaria
o lugar morto, invisível para quem compraria de verdade.

## Escopo

### Entra

* Reserva de um assento de um evento publicado, por cliente autenticado.
* Proteção contra venda dupla em duas camadas: lock no Redis e constraint no
  banco.
* Expiração de reserva não paga, liberando o assento.
* Pagamento simulado, com aprovação ou recusa, confirmando a reserva.
* Idempotência por `Idempotency-Key` na criação de reserva e no pagamento.
* Cancelamento da própria reserva.
* Consulta das próprias reservas.

### Não entra

* Emissão do ingresso e QR Code — spec 0005. O pagamento aprovado confirma a
  reserva; o ingresso nasce no épico seguinte.
* Integração com gateway de pagamento real.
* Reserva de vários assentos numa requisição. Um assento por reserva mantém a
  garantia simples e auditável.

## Regras de negócio

1. **RN-1** — Um assento nunca tem duas reservas ativas (`PENDING` ou
   `CONFIRMED`). A garantia final é a constraint do banco, não o lock
   ([ADR 0003](../../adr/0003-lock-redis-com-constraint-no-banco.md)).
2. **RN-2** — Com o Redis fora do ar, o sistema continua correto: a reserva
   segue protegida pela constraint. Perde-se desempenho, nunca integridade.
3. **RN-3** — Só se reserva assento de evento `PUBLISHED`, e o assento tem de
   pertencer àquele evento.
4. **RN-4** — Reserva nasce `PENDING` com prazo. Vencido o prazo sem pagamento,
   ela não segura mais o assento.
5. **RN-5** — Requisição repetida com o mesmo `Idempotency-Key` devolve o
   resultado da primeira, sem criar uma segunda reserva nem uma segunda cobrança.
6. **RN-6** — Redis fora do ar degrada a idempotência: a requisição é processada
   normalmente, em vez de falhar.
7. **RN-7** — Só o dono paga, cancela ou vê a própria reserva.
8. **RN-8** — Pagamento aprovado confirma a reserva; recusado a deixa `PENDING`,
   e o cliente pode tentar de novo até o prazo vencer.
9. **RN-9** — Reserva confirmada não expira nem é liberada por prazo.

## Critérios de aceite

* **CA-1** — Dado um assento livre de evento publicado, quando o cliente reserva,
  então nasce uma reserva `PENDING` com prazo, e o assento deixa de constar como
  disponível.
* **CA-2** — Dadas duas requisições simultâneas para o mesmo assento, quando as
  duas são processadas, então exatamente uma cria reserva e a outra recebe 409.
* **CA-3** — Dadas vinte requisições simultâneas para o mesmo assento, quando
  todas são processadas, então existe exatamente uma reserva ativa no banco.
* **CA-4** — Dado o Redis indisponível, quando duas requisições simultâneas
  disputam o mesmo assento, então ainda assim só uma reserva ativa existe.
* **CA-5** — Dado um assento de outro evento, quando o cliente tenta reservá-lo
  naquele evento, então a resposta é 404 ou 409, e nada é criado.
* **CA-6** — Dado um evento não publicado, quando o cliente tenta reservar, então
  a resposta é 409.
* **CA-7** — Dada uma reserva `PENDING` vencida, quando outro cliente reserva o
  mesmo assento, então a reserva vencida é marcada `EXPIRED` e a nova é criada.
* **CA-8** — Dado o mesmo `Idempotency-Key` em duas criações de reserva, quando a
  segunda chega, então devolve a resposta da primeira e não cria outra reserva.
* **CA-9** — Dado um pagamento aprovado, quando processado, então a reserva vira
  `CONFIRMED` e existe um `Payment` `APPROVED`.
* **CA-10** — Dado um pagamento recusado, quando processado, então a reserva
  segue `PENDING` e existe um `Payment` `REFUSED`.
* **CA-11** — Dado o mesmo `Idempotency-Key` em dois pagamentos, quando o segundo
  chega, então devolve a resposta do primeiro sem cobrar de novo.
* **CA-12** — Dada uma reserva de outro cliente, quando alguém tenta pagá-la ou
  cancelá-la, então a resposta é 403.
* **CA-13** — Dada uma reserva própria `PENDING`, quando o cliente a cancela,
  então ela vira `CANCELED` e o assento volta a ficar disponível.
* **CA-14** — Dado um cliente com reservas, quando consulta as próprias, então vê
  as suas e não as de outro cliente.
* **CA-15** — Dada uma reserva vencida, quando o cliente tenta pagá-la, então a
  resposta é 409.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| Assento já reservado | `409` `CONFLICT` |
| Evento não publicado | `409` `CONFLICT` |
| Assento inexistente, ou de outro evento | `404` `NOT_FOUND` |
| Reserva de outro cliente | `403` `FORBIDDEN` |
| Pagar reserva vencida, cancelada ou já confirmada | `409` `CONFLICT` |
| Corpo ou parâmetro inválido | `400` `VALIDATION_ERROR` |

## Referências

* [ADR 0003](../../adr/0003-lock-redis-com-constraint-no-banco.md) — as duas
  camadas de proteção.
* Seção 6 do [`CLAUDE.md`](../../../CLAUDE.md) — idempotência e concorrência.
