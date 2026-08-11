---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0002. Modelar lugares como mapa de assentos, não como contador de capacidade

## Contexto e problema

A seção 5 do [`CLAUDE.md`](../../CLAUDE.md) deixa a modelagem em aberto: ou
existe uma tabela `Seat` com um registro por lugar, ou o evento controla apenas
`capacity` contra um `soldCount`, no modelo de "pista". A escolha define o schema
Prisma desde o Épico 1 e determina como o requisito mais sensível do desafio —
nunca vender o mesmo lugar duas vezes — será garantido.

## Forças da decisão

* O requisito fala em "mesmo lugar", e precisa ser demonstrável, não argumentado.
* A garantia deve ser auditável por quem lê o schema, sem executar o código.
* O prazo é curto: a solução não pode dobrar a superfície de teste.
* O ingresso emitido precisa identificar o lugar para ter sentido na portaria.

## Opções consideradas

* Mapa de assentos: tabela `Seat` com `label` e `status`
* Pista: contador `soldCount` contra `capacity` no próprio `Event`
* Os dois, selecionados por um campo `seatingMode` no evento

## Decisão

Escolhida a opção "mapa de assentos", porque transforma o requisito numa
constraint declarativa do banco em vez de aritmética sobre um contador: com um
registro por lugar, "não vender duas vezes" vira um índice único, verificável
lendo o schema.

```prisma
model Seat {
  id      String     @id @default(uuid())
  eventId String
  label   String     // "B12"
  status  SeatStatus // AVAILABLE | RESERVED | SOLD
  event   Event      @relation(fields: [eventId], references: [id])

  @@unique([eventId, label])
}
```

A garantia final contra dupla reserva está no [ADR 0003](0003-lock-redis-com-constraint-no-banco.md).

### Consequências

* Boa, porque o teste de concorrência fica direto ao ponto: N requisições
  simultâneas ao mesmo `seatId`, exatamente uma reserva criada.
* Boa, porque o ingresso e o QR Code carregam um lugar concreto, o que dá
  sentido à validação na portaria.
* Ruim, porque o seed precisa gerar um registro por assento, e criar um evento
  passa a implicar criar N linhas — o que exige atenção a capacidades grandes.
* Ruim, porque descarta o caso de uso real de evento sem lugar marcado; suportá-lo
  depois exigirá um ADR novo que substitua este.

### Confirmação

Um teste de integração dispara requisições concorrentes de reserva para o mesmo
`seatId` e verifica que exatamente uma é confirmada e as demais recebem conflito.
O mesmo teste roda com o Redis indisponível: sem o lock, o resultado precisa
continuar sendo uma única reserva confirmada.

## Prós e contras das opções

### Mapa de assentos

* Boa, porque a integridade fica declarada no banco, não espalhada em service.
* Boa, porque o lock distribuído ganha uma chave determinística natural
  (`lock:seat:{eventId}:{seatId}`).
* Neutra, porque exige seed mais elaborado.
* Ruim, porque não atende evento de pista sem mudança de modelo.

### Pista (contador)

* Boa, porque o schema é mínimo e o seed é trivial.
* Boa, porque suporta reserva de várias entradas numa requisição só.
* Ruim, porque a garantia vira um `UPDATE ... WHERE soldCount + qty <= capacity`,
  correto mas menos evidente para quem revisa: é preciso raciocinar sobre
  aritmética concorrente em vez de ler uma constraint.
* Ruim, porque o ingresso não identifica lugar, o que empobrece a validação.

### Os dois modos

* Boa, porque cobre os dois casos de uso reais.
* Ruim, porque exige duas estratégias de concorrência corretas e testadas em vez
  de uma, no mesmo prazo — o risco de entregar as duas pela metade é maior que o
  ganho de cobrir os dois casos.

## Mais informações

* [Prisma — Data model](https://www.prisma.io/docs/orm/prisma-schema/data-model/models)
* Revisitar se o escopo passar a incluir eventos sem lugar marcado.
