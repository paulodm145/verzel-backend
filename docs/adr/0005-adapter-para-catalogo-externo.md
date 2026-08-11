---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0005. Isolar o catálogo externo atrás de um Adapter

## Contexto e problema

O organizador cria eventos a partir de um catálogo externo, e o desafio permite
usar Ticketmaster Discovery, TMDb, ou ambos. As duas APIs diferem em autenticação,
paginação, nomes de campo e formato de data. Se o domínio conhecer esses
detalhes, trocar de fonte — ou suportar as duas — vira reescrita de regra de
negócio. Além disso, ambas impõem limite de requisições, e o ambiente será
exercitado por um avaliador.

## Forças da decisão

* Trocar ou somar fontes deve ser configuração, não reescrita.
* O evento publicado não pode depender de chamada externa para ser servido.
* Rate limit da API externa não pode derrubar a avaliação.
* API externa fora do ar não pode travar a aplicação inteira.

## Opções consideradas

* Adapter: uma interface `CatalogProvider` com uma implementação por API
* Cliente único chamando a API escolhida direto do service
* Sincronização periódica do catálogo para uma tabela local

## Decisão

Escolhida a opção "Adapter", porque o requisito de trocar de fonte é conhecido
desde o início — é a exceção legítima ao YAGNI do princípio 7 da constituição.

`CatalogProvider` define `search(query, pagination)` e `getById(externalId)`,
devolvendo `CatalogItem` já normalizado (`externalId`, `title`, `date`,
`imageUrl`, `sourceType: SHOW | MOVIE`). Cada adapter traduz sua API; toda
particularidade de formato, paginação e autenticação fica presa lá dentro.
`catalog.service.ts` depende só da interface e nunca importa um adapter;
`catalog.factory.ts` decide por configuração quais instanciar. Com mais de um
ativo, o service agrega os resultados sem mudar o contrato de saída.

Cada adapter usa o `fetch` nativo com timeout próprio, e os resultados de busca
são cacheados no Redis por 5 a 10 minutos. O `Event` guarda apenas os dados já
normalizados: uma vez publicado, ele nunca mais depende da API externa.

### Consequências

* Boa, porque o domínio fica testável com um provider falso, sem rede.
* Boa, porque o cache protege contra rate limit durante a avaliação, e a
  desnormalização no `Event` faz a listagem pública sobreviver à API externa
  fora do ar.
* Ruim, porque o contrato comum é o menor denominador entre as duas APIs:
  capacidade específica de uma delas ou fica de fora, ou vaza pelo campo `raw` e
  corrói o isolamento que motivou o Adapter.
* Ruim, porque acrescenta uma camada de indireção que só compensa se uma segunda
  fonte de fato existir — com um adapter só, é abstração sem retorno.
* Ruim, porque cache de 5 a 10 minutos serve resultado defasado; aceitável para
  busca em catálogo, seria inaceitável para preço ou disponibilidade.

### Confirmação

Um teste de arquitetura, ou uma verificação na revisão de PR, garante que nenhum
arquivo fora de `modules/catalog/adapters/` e `catalog.factory.ts` importe um
adapter concreto. Testes unitários do `catalog.service` usam um `CatalogProvider`
falso, sem tocar a rede. Cada adapter tem teste de tradução com um payload real
capturado da API correspondente.

## Prós e contras das opções

### Adapter

* Boa, porque suportar as duas APIs simultaneamente não muda o service.
* Boa, porque o domínio se testa sem rede.
* Neutra, porque acrescenta arquivos e uma indireção.
* Ruim, porque o contrato comum limita o que cada API pode oferecer.

### Cliente único no service

* Boa, porque é o caminho mais curto para o primeiro endpoint funcionar.
* Ruim, porque acopla o domínio ao formato de uma API de terceiro, e mudança
  unilateral de contrato do fornecedor vira mudança em regra de negócio.
* Ruim, porque testar o service passa a exigir mock de HTTP.

### Sincronização periódica para tabela local

* Boa, porque elimina latência e rate limit em tempo de requisição.
* Ruim, porque exige job agendado, controle de sincronização incremental e
  estratégia de invalidação — infraestrutura desproporcional ao desafio.
* Ruim, porque replica um catálogo inteiro para usar uma fração dele.

## Mais informações

* [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
* [TMDb API](https://developer.themoviedb.org/docs/getting-started)
* [Node.js — Fetch API](https://nodejs.org/api/globals.html#fetch): sem
  dependência de cliente HTTP, conforme a seção 2 do `CLAUDE.md`.
* Seção 9 do [`CLAUDE.md`](../../CLAUDE.md).
