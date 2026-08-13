# 1. Começando

## Base URL

```
http://localhost:3000
```

Não há prefixo `/api`. As rotas começam direto em `/auth`, `/events`,
`/reservations`, `/tickets`, `/gate`.

## CORS

A API responde CORS para as origens listadas em `CORS_ORIGINS` no `.env` do
backend. O padrão já inclui:

```
http://localhost:5173   (Vite)
http://localhost:3001
```

Se o seu dev server subir em outra porta, acrescente-a lá e reinicie o backend —
não adianta mexer no frontend.

Dois pontos que costumam morder:

- **Não é curinga.** A API é chamada com `Authorization`, então responder `*`
  seria configuração ruim. Origem desconhecida simplesmente não recebe o
  cabeçalho de liberação, e o navegador bloqueia.
- **`Idempotency-Replayed` é exposto explicitamente.** Por padrão o navegador
  esconde cabeçalhos de resposta do JavaScript; esse foi liberado porque você
  vai querer lê-lo (ver [`04-reserva-e-pagamento.md`](04-reserva-e-pagamento.md)).

## Formato

- Requisição e resposta em JSON (`Content-Type: application/json`)
- Corpo limitado a **100 KB**
- Datas em **ISO 8601 UTC** (`2026-12-20T21:00:00.000Z`)
- Dinheiro em **número**, não string: `45.5`
- Identificadores em **UUID v4**, exceto o código do ingresso (`TKT-XXXX-XXXX-XXXX`)

## Cliente HTTP mínimo

Nada aqui exige biblioteca. Um `fetch` embrulhado resolve:

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "content-type": "application/json" } : {}),
      // Só o token. Escrever "Bearer" aqui e no valor duplica o esquema.
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? "Falha inesperada",
      body.error?.details,
      body.error?.requestId,
    );
  }

  return body as T;
}
```

O `requestId` que vem no erro é o mesmo que aparece no log do backend. Mostre-o
numa tela de erro genérica: ele transforma "deu erro" em algo rastreável.

## Variáveis de ambiente do frontend

```bash
VITE_API_URL=http://localhost:3000
```

## Gerando tipos a partir do contrato

O `/docs.json` é um documento OpenAPI 3.0 válido. Se quiser tipos sem escrevê-los
à mão:

```bash
npx openapi-typescript http://localhost:3000/docs.json -o src/api/schema.d.ts
```

Como os schemas do backend são gerados dos mesmos objetos Zod que validam a
entrada, os tipos gerados acompanham o servidor sem ninguém lembrar de
sincronizar.
