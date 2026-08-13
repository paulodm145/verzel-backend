# 6. Erros e convenções

## Formato único de erro

Toda resposta de erro tem a mesma forma, qualquer que seja a origem:

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos",
    "details": [                          // só em erro de validação
      { "path": "email", "message": "Invalid email address" },
      { "path": "password", "message": "Too small: expected string to have >=8 characters" }
    ],
    "requestId": "4a39b172-b2b3-4df5-a572-a304ce067f62"
  }
}
```

Trate pelo **`code`**, nunca pela mensagem — mensagens mudam, códigos não.

O `requestId` é o mesmo que aparece no log do backend. Mostre-o na tela de erro
genérica: é o que transforma "deu erro" em algo que dá para investigar.

## Códigos

| `code` | Status | Significa | Reação típica |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Corpo, query ou params inválidos | Marcar campos com `details[].path` |
| `MALFORMED_JSON` | 400 | JSON quebrado | Bug do cliente |
| `UNAUTHORIZED` | 401 | Sem token, token inválido ou expirado | Renovar (uma vez) ou login |
| `FORBIDDEN` | 403 | Papel insuficiente | Mensagem de permissão. **Não renove** |
| `NOT_FOUND` | 404 | Recurso inexistente ou não visível | Voltar para a listagem |
| `ROUTE_NOT_FOUND` | 404 | Rota não existe | Bug do cliente |
| `CONFLICT` | 409 | Estado incompatível: assento ocupado, evento cancelado, chave de idempotência reusada | Depende do fluxo — ver cada documento |
| `TOO_MANY_REQUESTS` | 429 | Limite de tentativas | Aguardar e avisar |
| `INTERNAL_ERROR` | 500 | Falha inesperada | Tela genérica com `requestId` |

O `409` é o mais rico em significado nesta API. Leia a `message` para decidir o
texto da tela, mas ramifique a lógica pelo endpoint, não pela mensagem.

## Mapeando erro de validação para o formulário

```ts
if (erro instanceof ApiError && erro.code === "VALIDATION_ERROR") {
  for (const detalhe of erro.details ?? []) {
    form.setError(detalhe.path as keyof Campos, { message: detalhe.message });
  }
}
```

O `path` usa notação de ponto para campos aninhados. Corpo ausente vem com
`path: "(corpo)"`.

## Paginação

Três listas paginam, todas do mesmo jeito:

| Rota | Query |
| --- | --- |
| `GET /events` | `search`, `skip`, `take` |
| `GET /events/mine` | `search`, `skip`, `take` |
| `GET /reservations/mine` | `skip`, `take` |
| `GET /tickets/mine` | `skip`, `take` |

```jsonc
{ "items": [ /* … */ ], "total": 42, "skip": 0, "take": 20 }
```

`skip` começa em 0, `take` vale no máximo **50** (padrão 20). Pedir mais responde
`400`. Calcule as páginas com `Math.ceil(total / take)`.

O catálogo é a exceção: pagina com `page`, começando em **1**, porque acompanha a
paginação das APIs externas.

## Datas

Sempre ISO 8601 em UTC, com milissegundos: `2026-12-20T21:00:00.000Z`.

```ts
new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
}).format(new Date(evento.date));
```

Mande datas no mesmo formato ao criar evento. `new Date(...).toISOString()`
resolve.

Campos que podem vir `null`: `date` do item de catálogo, `usedAt` do ingresso,
`description` e `imageUrl` do evento.

## Dinheiro

`price` é **número** (`45.5`), não string. Foi convertido de `Decimal(10,2)` na
borda da API.

```ts
new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
  .format(evento.price);
```

Não faça aritmética com ponto flutuante para somar carrinho — nesta API cada
reserva é de um assento, então não há soma a fazer no cliente.

## Enumerações

```ts
type Role = "ORGANIZER" | "CUSTOMER" | "GATE";
type SourceType = "SHOW" | "MOVIE";
type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELED";
type ReservationStatus = "PENDING" | "CONFIRMED" | "EXPIRED" | "CANCELED";
type PaymentStatus = "APPROVED" | "REFUSED";
type TicketStatus = "VALID" | "USED";
type ValidationResult = "VALID" | "INVALID" | "ALREADY_USED" | "WRONG_EVENT";
```

## Cabeçalhos

| Cabeçalho | Onde | Para quê |
| --- | --- | --- |
| `Authorization: Bearer <token>` | Rotas autenticadas | Identidade |
| `Idempotency-Key: <uuid>` | Reserva e pagamento | Evitar duplicidade |
| `Idempotency-Replayed: true` | **Resposta** | Indica resposta reproduzida |

O último é exposto ao JavaScript pelo CORS. Ler é opcional, mas útil: `true`
significa que a operação **não** aconteceu de novo — o usuário clicou duas vezes.
