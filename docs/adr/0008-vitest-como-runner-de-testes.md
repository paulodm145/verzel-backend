---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0008. Vitest como runner de testes

## Contexto e problema

O `CLAUDE.md` exige testes unitários e de integração, mas não indica runner. O
Node 20 traz `node:test` embutido, o que a princípio atende o princípio de não
acrescentar dependência sem necessidade. A questão é se, neste projeto, ele
atende de fato.

## Forças da decisão

* Os testes mais importantes do desafio envolvem concorrência, expiração por
  tempo e integração com Postgres e Redis.
* Reserva com expiração exige controlar o relógio dentro do teste.
* O Node 20 não executa TypeScript diretamente — a remoção de tipos só chega no
  22.
* Uma dependência de desenvolvimento não entra no runtime de produção.

## Opções consideradas

* Vitest
* `node:test`, embutido no runtime
* `node:test` com a remoção de tipos do Node 22+

## Decisão

Escolhida a opção "Vitest", porque `node:test` no Node 20 não elimina a
dependência que motivaria escolhê-lo: sem execução nativa de TypeScript, seria
preciso somar um carregador (`tsx`) e configurar cobertura à parte, chegando a
mais peças móveis do que a alternativa que se queria evitar.

Some-se o que os testes deste projeto exigem em concreto: relógio controlável
para testar expiração de reserva sem `sleep`, e um modelo de mock ergonômico
para o `CatalogProvider` do [ADR 0005](0005-adapter-para-catalogo-externo.md).

Vitest entra apenas como dependência de desenvolvimento, com
`@vitest/coverage-v8` para cobertura.

### Consequências

* Boa, porque executa TypeScript sem configuração adicional e traz cobertura,
  watch e relógio falso na mesma peça.
* Boa, porque testar concorrência e expiração fica direto, sem espera real.
* Ruim, porque é uma dependência de desenvolvimento robusta a mais, com seu
  próprio ritmo de versões — o oposto do que o princípio 6 recomenda, e aceito
  aqui conscientemente.
* Ruim, porque a API não é a do `node:test`: migrar depois custaria reescrever
  os testes, ainda que a maior parte da sintaxe seja compatível.
* Ruim, porque relógio falso é fácil de usar errado — um teste que congela o
  tempo e esquece de restaurá-lo contamina os seguintes, com falha intermitente
  difícil de rastrear.

### Confirmação

`npm test` roda unitários e integração e reporta cobertura. Os testes de
concorrência do Épico 4 e o teste de expiração precisam passar sem `sleep` real,
usando relógio controlado — se algum teste precisar esperar tempo de parede, a
escolha não está sendo aproveitada e deve ser questionada na revisão.

## Prós e contras das opções

### Vitest

* Boa, porque TypeScript, cobertura, mocks e relógio falso vêm juntos.
* Neutra, porque a sintaxe é próxima o bastante do `node:test` para não ser
  aprendizado novo.
* Ruim, porque acrescenta uma dependência de desenvolvimento significativa.

### `node:test` no Node 20

* Boa, porque não acrescenta nada ao `package.json`.
* Ruim, porque exigiria `tsx` para os testes em TypeScript, anulando a economia.
* Ruim, porque cobertura permanece experimental e o controle de tempo é mais
  cru.

### `node:test` com Node 22+

* Boa, porque removeria a necessidade de carregador.
* Ruim, porque prende o projeto a uma versão de Node mais nova só por causa do
  runner, e o ambiente de desenvolvimento atual é Node 20.

## Mais informações

* [Vitest](https://vitest.dev/guide/) e
  [`vi.useFakeTimers`](https://vitest.dev/api/vi.html#vi-usefaketimers)
* [Node.js — Test runner](https://nodejs.org/api/test.html)
* Seção 12 do [`CLAUDE.md`](../../CLAUDE.md).
