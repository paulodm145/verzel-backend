---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0004. QR Code como payload assinado com HMAC-SHA256

## Contexto e problema

O ingresso precisa de um QR Code que a portaria valide na entrada. Um
identificador opaco — um UUID, por exemplo — só tem significado depois de uma
consulta ao banco, e nada nele impede que alguém gere outro identificador
plausível e tente a sorte. O desafio trata a não-falsificação do QR Code como um
dos dois pontos mais sensíveis do sistema, e a portaria pode estar em
conectividade instável.

Como fazer um QR Code que não possa ser forjado e que possa ser rejeitado sem
tocar no banco quando for inválido?

## Forças da decisão

* Um QR forjado deve ser rejeitado sem consulta ao banco.
* Dois leitores de portaria não podem validar o mesmo ingresso ao mesmo tempo.
* A resposta precisa distinguir inválido, já utilizado e evento errado.
* Sem dependência nova: o `node:crypto` já resolve HMAC.

## Opções consideradas

* UUID opaco, validado por consulta ao banco
* Payload assinado com HMAC-SHA256 e segredo compartilhado
* JWT por ingresso

## Decisão

Escolhida a opção "payload assinado com HMAC-SHA256", porque torna a assinatura
verificável offline sem exigir infraestrutura de chaves, e porque `node:crypto`
já fornece tudo — nenhuma dependência nova, conforme o princípio 6 da
constituição.

```
payload          = { ticketId, eventId, code }
encodedPayload   = base64url(JSON.stringify(payload))
signature        = base64url(HMAC-SHA256(encodedPayload, TICKET_SECRET))
qrContent        = encodedPayload + "." + signature
```

`TICKET_SECRET` vive em variável de ambiente e nunca no código.

A assinatura cobre **a string codificada**, não o JSON original. A seção 7 do
`CLAUDE.md` esboça `HMAC(JSON.stringify(payload))`; assinar o JSON exigiria que a
portaria reconstruísse byte a byte a mesma serialização para conferir, e
`JSON.stringify` não garante ordem estável de chaves entre implementações — uma
reordenação ou um campo novo invalidaria todos os ingressos já emitidos.
Assinando o que de fato trafega, a verificação não depende de canonicalização
nenhuma. A propriedade criptográfica é idêntica; o que muda é a fragilidade.

A validação na portaria tem três etapas, nesta ordem:

1. **Assinatura.** Separa `qrContent` no ponto, recalcula o HMAC sobre
   `encodedPayload` e compara com o recebido usando `crypto.timingSafeEqual`, não
   `===` — comparação de string sai cedo no primeiro byte diferente e vaza, pelo
   tempo de resposta, quanto do prefixo está correto.

   `timingSafeEqual` **lança `RangeError` quando os buffers têm comprimentos
   diferentes** (`ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`). Como o comprimento da
   assinatura vem do cliente, é obrigatório comparar os tamanhos antes e tratar
   divergência como assinatura inválida. Sem essa guarda, uma assinatura truncada
   vira erro 500 em vez de `INVALID` — resposta errada, e ainda um jeito trivial
   de derrubar a portaria. Um QR malformado, sem ponto separador, cai no mesmo
   tratamento.

   Assinatura inválida retorna `INVALID` sem tocar no banco.
2. **Estado.** Com a assinatura válida, consulta o `Ticket` pelo `code` e
   confere se o `eventId` corresponde ao evento daquela portaria.
3. **Consumo atômico.** `UPDATE ticket SET status='USED' WHERE code = $1 AND
   status='VALID'`, olhando as linhas afetadas. Zero linhas significa que outro
   leitor chegou primeiro: resposta `ALREADY_USED`. A decisão está no resultado
   do próprio update, nunca num `SELECT` anterior.

### Consequências

* Boa, porque QR forjado é descartado por CPU, sem custo de banco — o que
  também limita o efeito de alguém tentar força bruta contra a portaria.
* Boa, porque o passo 3 elimina a corrida entre dois leitores sem lock nem
  transação explícita.
* Ruim, porque o segredo é simétrico: quem obtiver `TICKET_SECRET` emite
  ingressos válidos. Vazamento exige rotação do segredo e reemissão de todos os
  ingressos ativos, sem revogação parcial possível.
* Ruim, porque a assinatura por si só não expira nem sabe se o ingresso já foi
  usado — a verificação offline diz apenas "isto foi emitido por nós". O estado
  continua exigindo banco, o que limita o benefício em conectividade instável ao
  caso do QR falso.
* Ruim, porque a validação precisa tratar entrada malformada antes de qualquer
  operação criptográfica — comprimento de assinatura divergente, ausência do
  ponto separador, base64url inválido —, e cada um desses caminhos é uma chance
  de devolver 500 no lugar de `INVALID`.

### Confirmação

Testes unitários de `qrcode.service`: assinatura válida verifica; payload
adulterado em qualquer campo falha; assinatura de outro segredo falha; a
comparação usa `timingSafeEqual`.

Um teste específico cobre entrada malformada — assinatura truncada, QR sem o
ponto separador, base64url corrompido — e exige `INVALID`, nunca exceção
propagada. É o teste que impede a regressão do `RangeError`.

Teste de integração da portaria: validar o mesmo ingresso duas vezes retorna
`VALID` e depois `ALREADY_USED`; ingresso de outro evento retorna `WRONG_EVENT`.

Na revisão de código, comparação de assinatura com `===` ou `Buffer.compare` é
achado bloqueante, assim como qualquer decisão de consumo baseada em `SELECT`
anterior ao `UPDATE`.

## Prós e contras das opções

### Payload assinado com HMAC

* Boa, porque é verificável sem estado e sem dependência nova.
* Boa, porque o conteúdo do QR carrega `eventId`, permitindo rejeitar evento
  errado antes da consulta.
* Neutra, porque o QR fica maior que um UUID — irrelevante para a densidade de
  um QR Code.
* Ruim, porque segredo simétrico não permite revogação individual.

### UUID opaco

* Boa, porque é trivial de implementar e o QR fica mínimo.
* Ruim, porque não há como distinguir um código forjado de um inexistente sem ir
  ao banco: toda tentativa, legítima ou não, custa uma consulta.
* Ruim, porque não atende o requisito de integridade verificável do desafio.

### JWT por ingresso

* Boa, porque traz expiração e formato padronizado de fábrica.
* Neutra, porque com HS256 a propriedade criptográfica é a mesma do HMAC.
* Ruim, porque o cabeçalho e o registro de claims do JWT são carga inútil aqui, e
  a flexibilidade de algoritmo do formato é superfície de ataque conhecida
  (`alg: none`, confusão de algoritmo) sem nenhum ganho para este caso.

## Mais informações

* [Node.js — `crypto.createHmac`](https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options)
* [Node.js — `crypto.timingSafeEqual`](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b):
  exige buffers de mesmo comprimento, sob pena de `RangeError`.
* Seção 7 do [`CLAUDE.md`](../../CLAUDE.md). Esta decisão **diverge** do esboço
  de lá em um ponto: o HMAC cobre `base64url(JSON.stringify(payload))` e não
  `JSON.stringify(payload)`. A estrutura e a propriedade criptográfica são as
  mesmas; a mudança só elimina a exigência de serialização canônica na
  verificação. Se a divergência não for aceita, reverter aqui e acrescentar ao
  `qrcode.service` uma serialização com ordem de chaves fixa, coberta por teste.
