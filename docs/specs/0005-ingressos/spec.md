# Spec 0005 — Ingressos

| | |
| --- | --- |
| **Épico** | 5 — Ingressos |
| **Branch** | `feat/0005-ingressos` |
| **Status** | approved |

## Problema

Pagamento aprovado precisa virar ingresso, e o ingresso precisa ser
**apresentável na portaria** e **impossível de forjar**. Um código sequencial ou
um UUID solto não servem: quem descobre o padrão entra de graça, e a portaria não
tem como distinguir um código inventado de um emitido.

A portaria também pode estar com conectividade instável na entrada do evento. Um
ingresso que só é verificável com o banco disponível é um ingresso que trava a
fila quando a rede cai.

O cliente ainda precisa reencontrar seus ingressos e poder compartilhar um deles
— mandar para quem vai junto, sem que isso vire uma porta para adivinhar
ingressos alheios.

## Escopo

### Entra

* Emissão do ingresso quando o pagamento é aprovado, na mesma transação.
* Código único e assinatura HMAC verificável sem consultar o banco.
* Conteúdo do QR Code em formato próprio, pronto para a portaria ler.
* Listagem dos próprios ingressos.
* Link de compartilhamento e consulta de ingresso por código.

### Não entra

* Validação na entrada e marcação de uso — spec 0006.
* Geração da imagem do QR Code. O backend devolve o conteúdo assinado; desenhar
  o quadrado é trabalho do frontend, e embutir um gerador de imagem aqui seria
  dependência sem retorno.
* Transferência de titularidade do ingresso.

## Regras de negócio

1. **RN-1** — Ingresso nasce apenas de reserva `CONFIRMED`, e cada reserva gera
   no máximo um.
2. **RN-2** — O código do ingresso é aleatório e não adivinhável.
3. **RN-3** — O conteúdo do QR é verificável **sem consulta ao banco**: quem tem
   o segredo confere a assinatura sozinho ([ADR 0004](../../adr/0004-qrcode-com-assinatura-hmac.md)).
4. **RN-4** — Qualquer alteração no payload invalida a assinatura.
5. **RN-5** — O segredo de assinatura vem do ambiente e nunca é versionado.
6. **RN-6** — O cliente vê apenas os próprios ingressos.
7. **RN-7** — A consulta por código é pública, porque é o link de
   compartilhamento, e por isso devolve só o necessário para apresentar o
   ingresso — sem dados pessoais do comprador.

## Critérios de aceite

* **CA-1** — Dado um pagamento aprovado, quando processado, então existe um
  ingresso `VALID` com código e assinatura.
* **CA-2** — Dado um pagamento recusado, quando processado, então nenhum ingresso
  é emitido.
* **CA-3** — Dado o conteúdo do QR, quando verificado com o segredo, então a
  verificação devolve `ticketId`, `eventId` e `code`.
* **CA-4** — Dado um conteúdo de QR com um caractere alterado, quando verificado,
  então é recusado.
* **CA-5** — Dado um QR assinado com outro segredo, quando verificado, então é
  recusado.
* **CA-6** — Dados dois ingressos, quando comparados, então seus códigos diferem.
* **CA-7** — Dado um cliente com ingressos, quando lista os próprios, então vê os
  seus e não os de outro cliente.
* **CA-8** — Dado o código de um ingresso, quando consultado publicamente, então
  a resposta traz evento, assento, status e o conteúdo do QR, e **não** traz
  dados pessoais do comprador.
* **CA-9** — Dado um código inexistente, quando consultado, então a resposta é
  404.
* **CA-10** — Dado um ingresso emitido, quando o cliente o consulta, então recebe
  também o link de compartilhamento.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| Código de ingresso inexistente | `404` `NOT_FOUND` |
| Listar ingressos sem autenticação | `401` `UNAUTHORIZED` |
| Listar ingressos como organizador | `403` `FORBIDDEN` |

## Referências

* Seção 7 do [`CLAUDE.md`](../../../CLAUDE.md) e
  [ADR 0004](../../adr/0004-qrcode-com-assinatura-hmac.md).
* [Spec 0004](../0004-reserva-pagamento/spec.md) — o pagamento que dispara a
  emissão.
