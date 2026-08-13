# 2. Autenticação

## Como a sessão funciona

Login devolve **dois tokens**:

| Token | Vida | Onde vai | Para quê |
| --- | --- | --- | --- |
| `accessToken` | 15 min | Cabeçalho `Authorization: Bearer …` | Toda requisição autenticada |
| `refreshToken` | 7 dias | Corpo de `POST /auth/refresh` | Obter um par novo |

O `accessToken` é um JWT verificado por assinatura, sem consulta ao banco — por
isso é curto: não há como revogá-lo antes de expirar. O `refreshToken` é opaco
e revogável.

## ⚠️ A regra que mais derruba integração

**Cada `refreshToken` vale uma única vez.** Renovar invalida o token usado e
emite outro. Reapresentar um token já usado é tratado como **indício de roubo** e
**derruba todas as sessões daquele usuário** — o cliente é deslogado em todos os
dispositivos.

Isso significa que **duas chamadas simultâneas a `/auth/refresh` deslogam o
usuário**. É o cenário clássico: três requisições recebem 401 ao mesmo tempo,
cada uma dispara uma renovação, a primeira funciona e as outras duas derrubam a
sessão inteira.

A solução é *single-flight*: uma renovação por vez, com as demais aguardando a
mesma promessa.

```ts
let renovacaoEmCurso: Promise<Session> | null = null;

export function renovarSessao(refreshToken: string): Promise<Session> {
  // Sem isto, duas renovações concorrentes derrubam a sessão do usuário
  renovacaoEmCurso ??= api<Session>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).finally(() => {
    renovacaoEmCurso = null;
  });

  return renovacaoEmCurso;
}
```

Guarde o par novo **antes** de refazer as requisições pendentes: o token antigo
já não vale.

## Rotas

### `POST /auth/register` — pública

```jsonc
// requisição
{ "name": "Ana Cliente", "email": "ana@example.com", "password": "senha-de-teste-123" }

// 201
{
  "user": { "id": "uuid", "name": "Ana Cliente", "email": "ana@example.com",
            "role": "CUSTOMER", "createdAt": "2026-08-13T10:00:00.000Z" },
  "session": { "accessToken": "eyJ…", "refreshToken": "9f2…", "expiresIn": 900 }
}
```

Regras: nome de 2 a 120 caracteres, e-mail válido (normalizado para minúsculas),
senha de 8 a 128. **`role` enviado no corpo é descartado** — sempre nasce
`CUSTOMER`.

Erros: `409 CONFLICT` (e-mail já cadastrado), `400 VALIDATION_ERROR`,
`429 TOO_MANY_REQUESTS` (5 cadastros por 5 min, por IP).

### `POST /auth/login` — pública

```jsonc
// requisição
{ "email": "cliente1@verzel.test", "password": "cliente123" }
// 200 — mesmo formato do register
```

Erros: `401 UNAUTHORIZED` para e-mail inexistente **e** senha errada — com
mensagem idêntica, de propósito. Não tente distinguir "conta não existe" de
"senha errada" na tela: a API não conta, e contar seria vazar quais e-mails têm
conta. `429` após 10 tentativas por minuto na mesma conta.

### `POST /auth/refresh` — pública

```jsonc
{ "refreshToken": "9f2…" }
// 200
{ "accessToken": "eyJ…", "refreshToken": "outro…", "expiresIn": 900 }
```

É pública porque quem a chama tem o token de renovação justamente por o de
acesso já ter expirado.

Erro: `401` para token desconhecido, expirado ou **já usado**. Nesse último
caso, todas as sessões caem — mande o usuário para a tela de login.

### `POST /auth/logout` — autenticada

```jsonc
{ "refreshToken": "9f2…" }
// 204, sem corpo
```

Encerra **apenas** a sessão apresentada: sair no celular não desloga o
navegador. Token desconhecido ou de outro usuário termina em silêncio, também
com 204.

### `GET /auth/me` — autenticada

```jsonc
// 200
{ "id": "uuid", "name": "Caio Cliente", "email": "cliente1@verzel.test",
  "role": "CUSTOMER", "createdAt": "2026-08-12T20:08:52.343Z" }
```

Use no boot do app para reidratar o usuário a partir de um token guardado.

## Papéis e o que acontece quando falta permissão

| Situação | Status | O que fazer na tela |
| --- | --- | --- |
| Sem token, ou token expirado/inválido | `401` | Renovar (uma vez só) ou mandar para o login |
| Autenticado, papel insuficiente | `403` | **Não** tente renovar — renovar não resolve. Mostre "sem permissão" |

A distinção importa: tratar `403` como sessão expirada gera um laço de
renovação que termina deslogando o usuário por reuso de token.

## Onde guardar os tokens

Não há suporte a cookie `httpOnly` nesta API — os tokens vêm no corpo.
Recomendação pragmática para o escopo do desafio:

- `accessToken` em **memória** (contexto/store). Some ao recarregar, e o refresh
  o recupera.
- `refreshToken` em `localStorage`, para a sessão sobreviver ao F5.

É uma troca consciente: `localStorage` é acessível por XSS. Em produção real, o
caminho seria cookie `httpOnly` + `SameSite`, o que exigiria mudança no backend.
Documente a escolha em vez de deixá-la implícita.

## Mensagens de 401 que você vai encontrar

A API distingue **erro de formato** de **token inválido**:

| Mensagem | Causa |
| --- | --- |
| `Autenticação obrigatória: envie o cabeçalho Authorization` | Faltou o cabeçalho |
| `Formato inválido do cabeçalho Authorization: use "Bearer <token>"` | Mandou o token sem o esquema |
| `O valor do token não deve repetir "Bearer"` | Escreveu `Bearer` no valor **e** no esquema |
| `Sessão inválida ou expirada` | Token adulterado, de outra chave, ou vencido |

As três primeiras são erro de montagem da requisição. A última é a única que diz
respeito à validade — e é idêntica nos três casos de propósito.
