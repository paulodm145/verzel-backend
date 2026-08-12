# Spec 0003 — Catálogo e eventos

| | |
| --- | --- |
| **Épico** | 3 — Catálogo e eventos |
| **Branch** | `feat/0003-catalogo-eventos` |
| **Status** | approved |

## Problema

O organizador precisa criar eventos a partir de um catálogo externo — shows do
Ticketmaster, filmes do TMDb — sem redigitar título, data e imagem à mão. E o
cliente precisa encontrar o que está publicado, sem enxergar rascunho nem evento
cancelado de outra pessoa.

Duas armadilhas moldam o desenho. A primeira: se o evento publicado depender de
uma chamada à API externa para ser servido, a listagem cai junto com o
fornecedor, e o avaliador do desafio vê uma tela vazia. A segunda: rate limit.
Buscas repetidas durante uma avaliação estouram a cota gratuita, e o sistema
precisa sobreviver a isso.

## Escopo

### Entra

* Busca no catálogo externo, restrita ao organizador, com resultado normalizado
  e cacheado.
* Criação de evento a partir de um item do catálogo, com data, local, capacidade
  e preço definidos pelo organizador.
* Geração do mapa de assentos no momento da criação, conforme a capacidade.
* Edição, publicação e cancelamento pelo organizador dono.
* Listagem e busca pública dos eventos publicados, paginadas.
* Detalhe público de um evento, com a contagem de assentos disponíveis.

### Não entra

* Reserva, pagamento e qualquer escrita sobre assento — spec 0004.
* Ingressos e portaria — specs 0005 e 0006.
* Edição do mapa de assentos depois de criado. Capacidade só muda enquanto o
  evento é rascunho, e a mudança regenera o mapa.

## Regras de negócio

1. **RN-1** — O domínio nunca depende de um provedor específico: o service
   conhece apenas a interface `CatalogProvider` ([ADR 0005](../../adr/0005-adapter-para-catalogo-externo.md)).
2. **RN-2** — Um provedor só é instanciado se a sua chave de API estiver
   configurada. Sem nenhuma chave, a busca responde vazio, e o resto do sistema
   segue de pé.
3. **RN-3** — Resultado de busca é cacheado no Redis por 10 minutos. Redis fora
   do ar degrada para chamada direta, nunca para erro.
4. **RN-4** — Chamada externa tem prazo próprio; provedor lento ou fora do ar não
   segura a resposta nem derruba a busca dos demais provedores.
5. **RN-5** — O evento guarda os dados já normalizados. Servir um evento
   publicado nunca chama a API externa.
6. **RN-6** — Só o organizador dono edita, publica ou cancela o seu evento. O
   `organizerId` vem do token, nunca do corpo.
7. **RN-7** — O mapa de assentos é criado junto com o evento, com um assento por
   unidade de capacidade, na mesma transação.
8. **RN-8** — Capacidade só muda enquanto o evento é `DRAFT`; a alteração
   regenera o mapa. Evento publicado tem mapa imutável.
9. **RN-9** — O público só enxerga eventos `PUBLISHED`. Rascunho e cancelado são
   visíveis apenas ao dono.
10. **RN-10** — Evento cancelado não volta a ser publicado.

## Critérios de aceite

* **CA-1** — Dado um organizador autenticado, quando busca no catálogo, então
  recebe itens normalizados com `externalId`, `title`, `sourceType` e imagem.
* **CA-2** — Dado um cliente autenticado, quando busca no catálogo, então recebe
  403.
* **CA-3** — Dada a mesma busca repetida dentro do TTL, quando a segunda chega,
  então o provedor externo não é chamado de novo.
* **CA-4** — Dado um provedor que falha ou demora além do prazo, quando a busca
  acontece, então os resultados dos demais provedores são devolvidos assim mesmo.
* **CA-5** — Dado um item de catálogo, quando o organizador cria um evento com
  capacidade `N`, então o evento nasce `DRAFT` com exatamente `N` assentos.
* **CA-6** — Dado um evento de outro organizador, quando alguém tenta editá-lo,
  então a resposta é 403 e nada muda.
* **CA-7** — Dado um evento `DRAFT`, quando o dono o publica, então ele passa a
  aparecer na listagem pública.
* **CA-8** — Dado um evento `DRAFT` cuja capacidade muda, quando a edição é
  salva, então o mapa de assentos passa a ter a nova quantidade.
* **CA-9** — Dado um evento `PUBLISHED`, quando se tenta mudar a capacidade,
  então a resposta é 409 e o mapa continua igual.
* **CA-10** — Dado um evento cancelado, quando se tenta publicá-lo, então a
  resposta é 409.
* **CA-11** — Dada a listagem pública, quando chamada sem autenticação, então
  devolve apenas eventos `PUBLISHED`, paginados por `skip` e `take`.
* **CA-12** — Dada a listagem pública com termo de busca, quando o termo casa com
  o título, então só os eventos correspondentes voltam.
* **CA-13** — Dado o detalhe público de um evento, quando consultado, então traz
  a contagem de assentos disponíveis.
* **CA-14** — Dado um organizador, quando lista os próprios eventos, então vê os
  seus rascunhos e cancelados, e não vê os de outro organizador.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| Busca no catálogo sem token | `401` `UNAUTHORIZED` |
| Busca no catálogo por não organizador | `403` `FORBIDDEN` |
| Corpo de criação ou edição inválido | `400` `VALIDATION_ERROR` |
| Evento inexistente | `404` `NOT_FOUND` |
| Evento de outro organizador | `403` `FORBIDDEN` |
| Mudar capacidade de evento publicado | `409` `CONFLICT` |
| Publicar evento cancelado | `409` `CONFLICT` |

## Referências

* Seção 9 do [`CLAUDE.md`](../../../CLAUDE.md) e
  [ADR 0005](../../adr/0005-adapter-para-catalogo-externo.md) — o Adapter.
* [ADR 0002](../../adr/0002-usar-mapa-de-assentos.md) — mapa de assentos.
* [Spec 0002](../0002-autenticacao/spec.md) — papéis e `requireRole`.
