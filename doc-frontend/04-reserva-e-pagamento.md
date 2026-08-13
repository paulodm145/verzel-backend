# 4. Reserva e pagamento

Este é o fluxo mais delicado da API. Duas pessoas clicando no mesmo assento é o
caso normal, não a exceção.

## O fluxo

```
GET /events/:id/seats        → escolher um assento com available: true
POST /events/:id/reservations → reserva PENDING, com prazo de 10 minutos
POST /reservations/:id/payment → confirma e emite o ingresso
GET /tickets/mine             → o ingresso com QR
```

## `POST /events/:id/reservations` — cliente

```jsonc
// cabeçalhos
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid gerado por você>

// requisição
{ "seatId": "uuid-do-assento" }

// 201
{
  "id": "uuid",
  "eventId": "uuid",
  "customerId": "uuid",
  "seatId": "uuid",
  "seatLabel": "A1",
  "status": "PENDING",
  "expiresAt": "2026-08-13T10:10:00.000Z",
  "createdAt": "2026-08-13T10:00:00.000Z"
}
```

### Os erros e o que a tela faz com cada um

| Status | Código | Quando | Tela |
| --- | --- | --- | --- |
| `409` | `CONFLICT` | Assento já reservado, ou sendo reservado agora | Recarregue o mapa e peça outro assento |
| `409` | `CONFLICT` | Evento não publicado | Volte para a listagem |
| `404` | `NOT_FOUND` | Assento não é daquele evento | Recarregue o mapa |
| `403` | `FORBIDDEN` | Papel não é `CUSTOMER` | Organizador não compra |

O `409` de assento ocupado **é esperado** e vai acontecer em uso normal. Trate-o
como fluxo, não como falha: mensagem curta, mapa recarregado, foco no próximo
assento livre.

### `expiresAt` é um contrato com o usuário

A reserva morre em 10 minutos se não for paga. Mostre um contador. Quando zerar,
não tente pagar — a API responde `409`, e o assento pode já ter sido levado.

## ⚠️ `Idempotency-Key`: a regra que confunde

O cabeçalho é **opcional**, mas mandar é fortemente recomendado: ele protege
contra duplo clique e retry de rede.

**Uma chave por intenção.** Gere um UUID novo a cada *nova* tentativa do usuário,
e reutilize a mesma chave apenas ao repetir *a mesma* requisição.

| Cenário | Chave | Resultado |
| --- | --- | --- |
| Usuário clica duas vezes em "reservar A1" | mesma | `201` com a mesma reserva; cabeçalho `Idempotency-Replayed: true` |
| Retry automático depois de falha de rede | mesma | idem — sem reserva duplicada |
| Usuário desiste do A1 e escolhe o A2 | **nova** | `201` normal |
| Usuário escolhe o A2 reaproveitando a chave do A1 | mesma | **`409`** — "já usada com um corpo diferente" |

A última linha é proteção, não bug: sem ela, você receberia de volta a reserva do
A1 e mostraria ao usuário que ele reservou o A2. Erro silencioso é pior que erro
visível.

```ts
// A chave nasce com a intenção, não com o request
async function reservar(eventId: string, seatId: string) {
  const chave = crypto.randomUUID();

  return api<Reservation>(`/events/${eventId}/reservations`, {
    method: "POST",
    headers: { "idempotency-key": chave },
    body: JSON.stringify({ seatId }),
    token,
  });
}
```

Se você implementar retry automático, guarde a chave junto da tentativa e
reutilize-a no retry — não gere outra.

## `POST /reservations/:id/payment` — cliente dono

```jsonc
// cabeçalhos: Authorization + Idempotency-Key (nova)
// requisição — ambos os campos são opcionais
{ "paymentMethod": "PIX", "simulate": "APPROVED" }

// 200
{
  "id": "uuid",
  "reservationId": "uuid",
  "status": "APPROVED",           // APPROVED | REFUSED
  "simulatedAt": "2026-08-13T10:02:00.000Z",
  "reservationStatus": "CONFIRMED" // CONFIRMED quando aprovado, PENDING quando recusado
}
```

`paymentMethod`: `CREDIT_CARD` (padrão) ou `PIX`.
`simulate`: `APPROVED` (padrão) ou `REFUSED`.

O campo `simulate` existe porque **não há gateway real**. Use-o para demonstrar
o caminho da recusa — vale a pena ter esse botão na tela de demonstração.

**Recusado deixa a reserva `PENDING`**: o usuário pode tentar de novo até o prazo
vencer. Não cancele a reserva por conta própria.

Erros:

| Status | Quando |
| --- | --- |
| `403` | Reserva de outro cliente |
| `409` | Já paga, cancelada, com prazo vencido, ou **evento cancelado** |

## `GET /reservations/mine`

```jsonc
{ "items": [ /* Reservation[] */ ], "total": 3, "skip": 0, "take": 20 }
```

Só as próprias. Ordenadas da mais recente para a mais antiga.

## `DELETE /reservations/:id`

Cancela a própria reserva **pendente** e libera o assento na hora. Devolve a
reserva com `status: "CANCELED"`.

Reserva já confirmada responde `409` — não existe estorno nesta API.

## Estados da reserva

```
        criada
          ↓
       PENDING ──── pagamento aprovado ───→ CONFIRMED ──→ (ingresso emitido)
          │
          ├──── prazo vencido ──────────→ EXPIRED
          └──── DELETE /reservations/:id → CANCELED
```

`EXPIRED` e `CANCELED` liberam o assento. `CONFIRMED` não expira.
