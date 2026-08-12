# Spec 0006 — Portaria

| | |
| --- | --- |
| **Épico** | 6 — Portaria |
| **Branch** | `feat/0006-portaria` |
| **Status** | approved |

## Problema

Na entrada do evento, alguém aponta um leitor para um QR Code — ou digita o
código, porque a câmera não pegou — e precisa de uma resposta imediata e sem
ambiguidade: **pode entrar, ou não pode, e por quê**.

Quatro situações se parecem para quem está na fila e são completamente
diferentes para quem opera a porta: ingresso legítimo, ingresso forjado, ingresso
que já entrou, e ingresso de outro evento. Confundir as duas últimas é o erro que
gera discussão na porta — "eu não entrei ainda" — e o sistema precisa ser capaz
de afirmar qual das duas aconteceu.

O caso mais delicado é o de dois leitores validando o mesmo ingresso ao mesmo
tempo, em portões diferentes. Se os dois receberem "válido", uma pessoa entrou
duas vezes com um ingresso só.

## Escopo

### Entra

* Validação por conteúdo de QR ou por código digitado.
* Quatro respostas distintas: válido, inválido, já utilizado, evento errado.
* Marcação de uso atômica, com registro de quem validou e quando.
* Consulta de ingresso pela portaria, sem marcar uso.

### Não entra

* Estorno ou reversão de uma validação. Desfazer entrada é operação
  administrativa, e o desafio não a pede.
* Validação offline com sincronização posterior. A verificação da assinatura
  funciona offline, mas a marcação de uso exige banco.

## Regras de negócio

1. **RN-1** — Só usuário `GATE` valida ingresso.
2. **RN-2** — Assinatura inválida é recusada **sem tocar no banco**
   ([ADR 0004](../../adr/0004-qrcode-com-assinatura-hmac.md)).
3. **RN-3** — A marcação de uso é atômica: `UPDATE ... WHERE status = 'VALID'`.
   Zero linhas afetadas significa que outro portão validou primeiro.
4. **RN-4** — Dois leitores validando o mesmo ingresso ao mesmo tempo produzem
   exatamente uma entrada; o segundo recebe "já utilizado".
5. **RN-5** — Ingresso de outro evento é recusado como `WRONG_EVENT`, e não como
   inválido: o ingresso é legítimo, só não é daquela porta.
6. **RN-6** — A validação registra quem validou e quando.
7. **RN-7** — Ingresso de evento cancelado é recusado.

## Critérios de aceite

* **CA-1** — Dado um QR legítimo de ingresso `VALID`, quando a portaria valida,
  então a resposta é `VALID`, e o ingresso passa a `USED` com data e responsável.
* **CA-2** — Dado o mesmo ingresso já validado, quando validado de novo, então a
  resposta é `ALREADY_USED` e traz quando foi usado.
* **CA-3** — Dado um QR com assinatura adulterada, quando validado, então a
  resposta é `INVALID` e nenhuma consulta ao banco é feita.
* **CA-4** — Dado um código inexistente, quando validado, então a resposta é
  `INVALID`.
* **CA-5** — Dado um ingresso de outro evento, quando validado no evento errado,
  então a resposta é `WRONG_EVENT` e o ingresso continua `VALID`.
* **CA-6** — Dadas duas validações simultâneas do mesmo ingresso, quando as duas
  são processadas, então uma recebe `VALID` e a outra `ALREADY_USED`.
* **CA-7** — Dado um usuário que não é portaria, quando tenta validar, então a
  resposta é 403.
* **CA-8** — Dado um código digitado à mão, quando validado, então funciona igual
  ao QR.
* **CA-9** — Dado um ingresso de evento cancelado, quando validado, então é
  recusado.
* **CA-10** — Dada a consulta de um ingresso pela portaria, quando feita, então
  o ingresso **não** é marcado como usado.

## Casos de erro

Validação sempre responde `200` com um resultado no corpo — inclusive para
ingresso inválido. A portaria precisa de um resultado, não de um erro HTTP para
tratar; o status 4xx fica para o que é erro de uso da API.

| Situação | Resposta |
| --- | --- |
| Corpo sem código nem QR | `400` `VALIDATION_ERROR` |
| Papel diferente de `GATE` | `403` `FORBIDDEN` |
| Ingresso válido | `200` `{ result: "VALID" }` |
| Assinatura ou código que não existe | `200` `{ result: "INVALID" }` |
| Ingresso já utilizado | `200` `{ result: "ALREADY_USED", usedAt }` |
| Ingresso de outro evento | `200` `{ result: "WRONG_EVENT" }` |

## Referências

* Seção 7 do [`CLAUDE.md`](../../../CLAUDE.md) e
  [ADR 0004](../../adr/0004-qrcode-com-assinatura-hmac.md).
