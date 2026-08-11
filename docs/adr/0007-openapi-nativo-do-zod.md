---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0007. Gerar o OpenAPI com o conversor nativo do Zod, sem lib de bridge

## Contexto e problema

A seção 11 do `CLAUDE.md` pede Swagger em `/docs` com schemas derivados dos
schemas Zod, evitando duplicar a definição, e sugere "usar uma lib de bridge
Zod→OpenAPI se fizer sentido". A pergunta é se ainda faz.

Documentação escrita à mão ao lado de schemas Zod diverge — não é hipótese, é o
comportamento padrão de qualquer par de artefatos que descrevem a mesma coisa em
lugares diferentes.

## Forças da decisão

* O schema Zod já é a fonte da verdade da validação; a documentação deve derivar
  dele, não repeti-lo.
* Cada dependência a mais é superfície de manutenção (princípio 6 da
  constituição).
* Libs de bridge historicamente atrasam em relação às versões do Zod, virando o
  fator que trava a atualização.

## Opções consideradas

* `z.toJSONSchema()`, nativo do Zod 4, com `target: "openapi-3.0"`
* Uma lib de bridge Zod→OpenAPI
* Escrever o documento OpenAPI à mão, ao lado dos schemas

## Decisão

Escolhida a opção "`z.toJSONSchema()` nativo", porque o Zod 4 passou a converter
para OpenAPI sem ajuda externa, o que torna a lib de bridge uma dependência que
não resolve mais nenhum problema.

```ts
const jsonSchema = z.toJSONSchema(createEventSchema, { target: "openapi-3.0" });
```

O documento OpenAPI é montado em `src/docs/swagger.ts` a partir de um registro de
schemas convertidos, e servido pelo `swagger-ui-express` — este sim uma
dependência necessária, porque serve a interface, não porque traduz schema.

A opção `io` merece atenção: por padrão a conversão representa o tipo de
**saída** do schema. Para documentar o corpo de uma requisição, que é entrada,
schemas com `default` ou `transform` precisam de `{ io: "input" }`, sob pena de
a documentação descrever campos como obrigatórios quando são opcionais.

### Consequências

* Boa, porque a documentação não pode divergir da validação: são o mesmo objeto.
* Boa, porque uma dependência a menos, e nenhuma trava de atualização do Zod.
* Ruim, porque o Zod converte schemas, não descreve rotas: o esqueleto do
  documento — paths, verbos, respostas, segurança — continua escrito à mão, e
  essa parte pode divergir das rotas reais.
* Ruim, porque construções sem representação em JSON Schema fazem a conversão
  lançar por padrão, o que só aparece quando alguém usa uma delas em algum épico
  adiante.

### Confirmação

Um teste garante que `GET /docs.json` responde um documento OpenAPI válido e que
todo schema do registro converte sem lançar — é o teste que pega uma construção
não representável no momento em que ela é introduzida, não meses depois.

Na revisão de código, qualquer schema de request ou response escrito à mão no
documento OpenAPI, em vez de derivado de um schema Zod, é achado bloqueante.

## Prós e contras das opções

### `z.toJSONSchema()` nativo

* Boa, porque acompanha o Zod por construção.
* Neutra, porque exige montar o esqueleto do documento manualmente.
* Ruim, porque lança em construções não representáveis, exigindo `override` ou
  ajuste do schema.

### Lib de bridge

* Boa, porque algumas oferecem registro de rotas além da conversão de schemas.
* Ruim, porque duplica um recurso que o Zod já tem.
* Ruim, porque acopla a atualização do Zod ao ritmo de um terceiro.

### OpenAPI escrito à mão

* Boa, porque dá controle total sobre o documento.
* Ruim, porque é exatamente a duplicação que o `CLAUDE.md` manda evitar: dois
  lugares descrevendo o mesmo contrato, divergindo no primeiro campo que mudar.

## Mais informações

* [Zod — JSON Schema](https://zod.dev/json-schema): `z.toJSONSchema()`, opções
  `target`, `io`, `unrepresentable` e `override`.
* Seção 11 do [`CLAUDE.md`](../../CLAUDE.md).
