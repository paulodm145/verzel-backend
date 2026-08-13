# 3. Catálogo e eventos

## Catálogo externo — só organizador

### `GET /catalog/search?query=&page=`

```jsonc
// 200
{
  "items": [
    {
      "externalId": "1AvjZ_aGkU6vXnK",
      "title": "Eagles Live at Sphere",
      "sourceType": "SHOW",              // SHOW (Ticketmaster) | MOVIE (TMDb)
      "date": "2026-09-19T03:30:00.000Z", // pode ser null
      "imageUrl": "https://…",            // pode ser null
      "description": "…",                 // pode ser null
      "provider": "ticketmaster"
    }
  ]
}
```

`query` exige ao menos 2 caracteres; `page` começa em 1 (máx. 50).

Três coisas para a interface:

- **Lista vazia não é erro.** Sem chave de API configurada no backend, a resposta
  é `200 {"items": []}`. Mostre "nenhum resultado", não uma tela de falha.
- **Provedor fora do ar não derruba o outro.** Se o Ticketmaster falhar, os
  filmes do TMDb chegam assim mesmo. Não assuma que a lista vazia significa
  sistema quebrado.
- **O backend cacheia por 10 minutos.** Buscar duas vezes o mesmo termo não gasta
  cota — mas veja o debounce em [`07-performance.md`](07-performance.md).

O `externalId` e o `sourceType` do item escolhido vão direto para a criação do
evento.

## Eventos

### Objeto `Event`

```jsonc
{
  "id": "uuid",
  "organizerId": "uuid",
  "sourceType": "MOVIE",
  "externalId": "550",
  "title": "Clube da Luta — Sessão Especial",
  "description": "…",          // nullable
  "imageUrl": "https://…",     // nullable
  "date": "2026-12-20T21:00:00.000Z",
  "venue": "Cine Arena",
  "capacity": 30,
  "price": 45,                 // número, não string
  "status": "PUBLISHED",       // DRAFT | PUBLISHED | CANCELED
  "createdAt": "2026-08-12T20:08:52.343Z"
}
```

### `GET /events` — pública

Query: `search` (opcional), `skip` (padrão 0), `take` (padrão 20, máx 50).

```jsonc
// 200
{ "items": [ /* Event[] */ ], "total": 12, "skip": 0, "take": 20 }
```

Só devolve `PUBLISHED`. Rascunho e cancelado não aparecem para ninguém além do
dono.

### `GET /events/:id` — pública

Devolve o `Event` mais `availableSeatsCount`. Responde `404` para evento
inexistente **ou não publicado** — a existência de um rascunho alheio não é
pública.

### `GET /events/:id/seats` — pública

**É daqui que sai o `seatId` exigido pela reserva.**

```jsonc
// 200
{
  "items": [
    { "id": "uuid", "label": "A1", "available": true },
    { "id": "uuid", "label": "A2", "available": false }
  ],
  "total": 30,
  "availableCount": 27
}
```

Os rótulos seguem `A1`…`A20`, `B1`…, vinte por fileira — dá para desenhar o mapa
agrupando pela letra:

```ts
const fileiras = Object.groupBy(seats.items, (assento) => assento.label[0]);
```

`available: false` significa que existe reserva ativa (`PENDING` ou `CONFIRMED`).
Um assento pode voltar a ficar livre quando a reserva expira ou é cancelada, por
isso **recarregue o mapa depois de um 409 na reserva**.

### `POST /events` — organizador

```jsonc
// requisição
{
  "externalId": "550",           // do item de catálogo
  "sourceType": "MOVIE",
  "title": "Clube da Luta — Sessão Especial",
  "description": "Sessão de estreia",   // opcional
  "imageUrl": "https://…",              // opcional
  "date": "2026-12-20T21:00:00.000Z",
  "venue": "Cine Arena",
  "capacity": 30,                // 1 a 500
  "price": 45                    // ≥ 0
}
// 201 → Event com status "DRAFT"
```

O mapa de assentos é criado junto, na mesma transação. Não existe passo separado
de "gerar assentos".

Erro `409` se o mesmo organizador já tiver um evento com o mesmo item de
catálogo **na mesma data** — duas sessões do mesmo filme em dias diferentes são
permitidas.

### `PATCH /events/:id` — organizador dono

Corpo parcial, ao menos um campo. `externalId` e `sourceType` não podem mudar.

**Capacidade só muda enquanto `DRAFT`.** Depois de publicado há gente comprando;
tentar mudar responde `409`. A alteração de capacidade regenera o mapa inteiro —
portanto os `seatId` mudam. Se sua tela guardava um `seatId`, recarregue.

### `POST /events/:id/publish` e `/cancel` — organizador dono

Publicar um evento já publicado é inofensivo (200). Publicar um cancelado
responde `409`: cancelado é estado final.

### `GET /events/mine` — organizador

Mesma paginação da listagem pública, mas traz `DRAFT` e `CANCELED` do próprio
organizador. Nunca traz eventos de outro.

## Fluxo do organizador, do começo ao fim

```
buscar no catálogo  →  escolher item  →  POST /events (nasce DRAFT)
                                              ↓
                            ajustar capacidade/preço (PATCH, ainda DRAFT)
                                              ↓
                                  POST /events/:id/publish
                                              ↓
                              aparece em GET /events para o público
```
