# Spec 0001 — Fundação

| | |
| --- | --- |
| **Épico** | 1 — Fundação |
| **Branch** | `feat/0001-fundacao` |
| **Status** | approved |

## Problema

O repositório tem processo e decisões documentadas, mas nenhum projeto
executável: não há como rodar nada, persistir nada nem responder a uma
requisição. Todo épico seguinte depende de um mesmo conjunto de fundações — um
runtime tipado, um banco cujo schema já carregue as garantias decididas nos ADRs,
cache e locks disponíveis, um formato único de resposta de erro, validação nas
bordas e documentação de API navegável.

Construir isso de forma dispersa, cada épico trazendo um pedaço, produziria
inconsistência exatamente onde ela é mais cara: se cada módulo inventar seu
próprio formato de erro ou sua própria forma de validar entrada, o custo de
uniformizar depois é maior que o de estabelecer o padrão agora.

## Escopo

### Entra

* Projeto Node/TypeScript em modo estrito, com ESLint e a estrutura de pastas da
  seção 4 do `CLAUDE.md`.
* Docker Compose com Postgres e Redis, ambos com volumes nomeados.
* Schema Prisma completo e migration inicial, incluindo o índice único parcial
  que garante o requisito do [ADR 0003](../../adr/0003-lock-redis-com-constraint-no-banco.md).
* Conexão com Redis, com desligamento limpo.
* Classes de erro de domínio e middleware de tratamento centralizado.
* Middleware de validação Zod para body, query e params.
* Logger estruturado.
* Endpoint de saúde reportando Postgres e Redis.
* Documentação OpenAPI servida em `/docs`, derivada dos schemas Zod.

### Não entra

* Cadastro, login, tokens e papéis — spec 0002.
* Catálogo externo e CRUD de eventos — spec 0003.
* Lógica de reserva, lock e pagamento — spec 0004. O schema que a sustenta entra
  aqui; o comportamento, não.
* Emissão e validação de ingressos — specs 0005 e 0006.
* Seed de dados de teste — spec 0002, junto dos usuários que ele cria.

## Regras de negócio

1. **RN-1** — Toda entrada vinda do cliente (body, query, params) é validada por
   Zod na borda. Nenhum service recebe dado não validado.
2. **RN-2** — Toda resposta de erro tem o mesmo formato, qualquer que seja a
   origem: validação, erro de domínio ou falha inesperada.
3. **RN-3** — Erro inesperado nunca expõe mensagem interna, stack trace ou
   detalhe de infraestrutura ao cliente; o detalhe vai para o log, com um
   identificador que também vai na resposta.
4. **RN-4** — O schema do banco impede, por constraint, duas reservas ativas para
   o mesmo assento, conforme o ADR 0003.
5. **RN-5** — Nenhum segredo é versionado. O `.env.example` documenta todas as
   variáveis exigidas, sem valores reais.
6. **RN-6** — A aplicação recusa iniciar se alguma variável de ambiente
   obrigatória estiver ausente ou malformada, em vez de falhar adiante na
   primeira requisição que dependa dela.
7. **RN-7** — Os dados de Postgres e Redis sobrevivem a `docker compose down`
   seguido de `up`. Só `down -v` os apaga.

## Critérios de aceite

* **CA-1** — Dado o repositório recém-clonado com `.env` preenchido a partir do
  exemplo, quando se executa `docker compose up -d` e `npm run db:migrate`, então
  a aplicação sobe e responde.
* **CA-2** — Dado o projeto, quando se executa `npm run typecheck` e
  `npm run lint`, então ambos terminam sem erro.
* **CA-3** — Dado o banco migrado, quando se inspeciona o índice de
  `Reservation`, então existe um índice único sobre `seatId` restrito aos status
  `PENDING` e `CONFIRMED`.
* **CA-4** — Dada uma reserva ativa para um assento, quando se tenta inserir uma
  segunda reserva ativa para o mesmo assento, então o banco rejeita a escrita —
  **inclusive por SQL direto, sem passar pela aplicação**.
* **CA-5** — Dada uma reserva `CANCELED` ou `EXPIRED` para um assento, quando se
  insere uma nova reserva ativa para esse assento, então a escrita é aceita.
* **CA-6** — Dado o serviço no ar, quando se faz `GET /health`, então a resposta
  é `200` e informa o estado de Postgres e Redis separadamente.
* **CA-7** — Dado o Redis indisponível, quando se faz `GET /health`, então a
  resposta indica Redis degradado sem derrubar o processo.
* **CA-8** — Dada uma rota com schema Zod, quando o corpo da requisição viola o
  schema, então a resposta é `400` no formato padrão, listando os campos
  inválidos e sem stack trace.
* **CA-9** — Dado um handler que lança um erro de domínio, quando a requisição é
  processada, então o status HTTP corresponde ao erro (`404` para `NotFoundError`,
  `409` para `ConflictError`) no formato padrão.
* **CA-10** — Dado um handler `async` que rejeita com um erro inesperado, quando a
  requisição é processada, então a resposta é `500` genérica com um identificador
  de correlação, e o log registra a stack completa com esse mesmo identificador.
* **CA-11** — Dado o serviço no ar, quando se acessa `GET /docs`, então o Swagger
  UI carrega a partir de um documento OpenAPI gerado dos schemas Zod.
* **CA-12** — Dada uma variável de ambiente obrigatória ausente, quando a
  aplicação inicia, então ela falha imediatamente com mensagem indicando qual
  variável falta.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| Corpo, query ou params violando o schema Zod | `400` `VALIDATION_ERROR`, com a lista de campos |
| JSON malformado no corpo | `400` `MALFORMED_JSON` |
| Recurso inexistente (`NotFoundError`) | `404` `NOT_FOUND` |
| Conflito de estado (`ConflictError`) | `409` `CONFLICT` |
| Rota inexistente | `404` `ROUTE_NOT_FOUND` |
| Falha inesperada | `500` `INTERNAL_ERROR`, com `requestId`, sem detalhe |

Formato único de resposta de erro:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos",
    "details": [{ "path": "email", "message": "E-mail inválido" }],
    "requestId": "01JC..."
  }
}
```

`details` é omitido quando não houver detalhe seguro para expor.

## Perguntas em aberto

Nenhuma.

## Referências

* Seções 2, 4, 5, 10 e 11 do [`CLAUDE.md`](../../../CLAUDE.md)
* [ADR 0002](../../adr/0002-usar-mapa-de-assentos.md) — modelagem de assentos
* [ADR 0003](../../adr/0003-lock-redis-com-constraint-no-banco.md) — o índice
  parcial que o CA-4 verifica
