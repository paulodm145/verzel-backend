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
registro por lugar, "não vender duas vezes" vira um índice único sobre a
reserva, verificável lendo o schema.

```prisma
model Seat {
  id      String @id @default(uuid())
  eventId String
  label   String // "B12"
  event   Event  @relation(fields: [eventId], references: [id])

  reservations Reservation[]

  @@unique([eventId, label])
}
```

O `@@unique([eventId, label])` acima só impede rótulos repetidos dentro de um
evento. **A garantia contra dupla venda não está aqui**: ela é o índice único
parcial sobre `Reservation`, no
[ADR 0003](0003-lock-redis-com-constraint-no-banco.md). O `Seat` existe para dar
identidade ao lugar; quem carrega o estado é a reserva.

Por isso o `Seat` **não tem coluna `status`**, apesar de a seção 5 do
`CLAUDE.md` sugerir uma — e ela abre espaço para ajustar os campos. Um `status`
no assento seria uma segunda fonte de verdade ao lado do índice em
`Reservation`, sem ninguém encarregado de mantê-las coerentes: bastaria uma
reserva expirar para o mapa exibir `RESERVED` indefinidamente, ou exibir
`AVAILABLE` com uma reserva ativa e o cliente descobrir o conflito só no `409`.
A disponibilidade é **derivada**: um assento está livre quando não existe
reserva ativa apontando para ele.

```sql
-- assentos disponíveis de um evento
SELECT s.* FROM "Seat" s
 WHERE s."eventId" = $1
   AND NOT EXISTS (
     SELECT 1 FROM "Reservation" r
      WHERE r."seatId" = s.id
        AND r.status IN ('PENDING','CONFIRMED')
   );
```

### Consequências

* Boa, porque o teste de concorrência fica direto ao ponto: N requisições
  simultâneas ao mesmo `seatId`, exatamente uma reserva criada.
* Boa, porque o ingresso e o QR Code carregam um lugar concreto, o que dá
  sentido à validação na portaria.
* Ruim, porque o seed precisa gerar um registro por assento, e criar um evento
  passa a implicar criar N linhas — o que exige atenção a capacidades grandes.
* Ruim, porque derivar a disponibilidade custa um anti-join a cada consulta do
  mapa, em vez da leitura direta de uma coluna. É o preço de ter uma fonte de
  verdade só; se virar gargalo, a saída é índice em `Reservation(seatId, status)`,
  não desnormalizar o estado de volta para o assento.
* Ruim, porque descarta o caso de uso real de evento sem lugar marcado; suportá-lo
  depois exigirá um ADR novo que substitua este.

### Confirmação

Um teste de integração dispara requisições concorrentes de reserva para o mesmo
`seatId` e verifica que exatamente uma é confirmada e as demais recebem conflito.
O mesmo teste roda com o Redis indisponível: sem o lock, o resultado precisa
continuar sendo uma única reserva confirmada.

Na revisão de código, qualquer coluna de estado acrescentada a `Seat` é achado
bloqueante enquanto não houver um ADR que substitua este: seria reintroduzir a
segunda fonte de verdade que a decisão eliminou.

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
