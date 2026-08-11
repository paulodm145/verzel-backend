---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0003. Lock no Redis como otimização, constraint no Postgres como garantia

## Contexto e problema

Reservar um assento é um "check-then-act" clássico: o serviço consulta se o
assento está livre e depois grava a reserva. Entre as duas operações, outra
requisição pode fazer a mesma checagem e chegar à mesma conclusão — e o sistema
vende o mesmo lugar duas vezes. Este é o requisito mais sensível do desafio.

Onde colocar a garantia: no lock distribuído, no banco, ou nos dois?

## Forças da decisão

* Duas requisições simultâneas para o mesmo assento não podem ambas ter sucesso.
* O Redis é infraestrutura auxiliar e pode cair; o sistema não pode ficar
  incorreto quando isso acontece — no máximo, indisponível.
* A garantia precisa ser auditável por quem lê o schema.
* O caminho feliz não deve pagar o custo de uma transação serializável.

## Opções consideradas

* Só lock distribuído no Redis
* Só constraint no Postgres
* Lock no Redis **e** constraint no Postgres, com papéis distintos

## Decisão

Escolhida a opção "lock **e** constraint, com papéis distintos", porque cada
camada resolve um problema diferente e nenhuma das duas sozinha resolve os dois.

**Camada 1 — Redis, otimização de concorrência.** Lock por assento adquirido com
`SET lock:seat:{eventId}:{seatId} <valor-aleatório> NX PX <ttl>`, exatamente o
padrão da documentação oficial do Redis. O valor aleatório é obrigatório: a
liberação compara o valor antes de apagar (via script Lua, ou `DELEX key IFEQ`
no Redis 8.4+), para que um cliente lento não apague o lock de outro. O papel
desta camada é evitar trabalho perdido e devolver erro claro ao segundo cliente,
não garantir integridade.

**Camada 2 — Postgres, fonte de verdade.** Índice único parcial sobre
`Reservation(seatId)` restrito aos status ativos. Duas reservas ativas para o
mesmo assento tornam-se impossíveis por definição do schema:

```prisma
generator client {
  provider        = "prisma-client"
  previewFeatures = ["partialIndexes"]
}

model Reservation {
  id        String            @id @default(uuid())
  seatId    String
  status    ReservationStatus // PENDING | CONFIRMED | EXPIRED | CANCELED
  expiresAt DateTime

  @@unique([seatId], where: raw("status IN ('PENDING','CONFIRMED')"))
}
```

O serviço trata a violação de unicidade (`P2002` no Prisma) como conflito de
negócio e responde `409`, em vez de deixá-la vazar como erro interno.

**Camada 3 — expiração explícita.** O predicado do índice não pode considerar
`expiresAt`: o Postgres exige que toda função usada em definição de índice seja
`IMMUTABLE`, e `now()` não é. Uma reserva `PENDING` vencida continua, para o
índice, tão ativa quanto qualquer outra — o assento ficaria travado para sempre
por quem abandonou o pagamento. A transição para `EXPIRED` precisa portanto ser
uma escrita de verdade, e acontece por dois caminhos complementares:

* **Verificação preguiçosa**, no caminho crítico: já com o lock do assento
  tomado, e dentro da mesma transação da nova reserva, o serviço marca como
  `EXPIRED` as reservas `PENDING` daquele assento cujo `expiresAt` já passou.
  Isto garante correção — o assento é liberado no exato momento em que alguém
  tenta reservá-lo de novo.
* **Job periódico**, como varredura de fundo: mantém o mapa de assentos honesto
  para quem só está navegando, sem depender de uma tentativa de reserva. É
  otimização de experiência, não de correção; se o job não rodar, o sistema
  continua correto.

### Consequências

* Boa, porque a correção não depende do Redis: com ele fora do ar, o sistema
  recusa reservas concorrentes pela constraint, mas nunca vende duas vezes.
* Boa, porque a garantia é declarativa e visível no schema, sem precisar ler o
  service para confiar nela.
* Ruim, porque índices parciais exigem a preview feature `partialIndexes` do
  Prisma 7.4+ — código que depende de preview feature pode quebrar em upgrade, e
  isso precisa ser revisitado quando o recurso estabilizar.
* Ruim, porque a lógica de reserva passa a ter dois caminhos de falha (lock não
  adquirido e violação de constraint) que precisam convergir para a mesma
  resposta ao cliente, sob risco de comportamento inconsistente.
* Ruim, porque a expiração não pode ser expressa no índice e vira código: a
  correção passa a depender de o serviço lembrar de expirar antes de reservar.
  É a parte frágil desta decisão, e por isso tem teste próprio.

### Confirmação

Quatro testes, todos obrigatórios antes de fechar o Épico 4:

1. N requisições concorrentes ao mesmo assento produzem exatamente uma reserva
   ativa.
2. O mesmo cenário **com o Redis desligado** produz o mesmo resultado — este é o
   teste que prova que a garantia está no banco, e não no lock.
3. Reserva `PENDING` com `expiresAt` no passado não impede uma nova reserva do
   mesmo assento: a verificação preguiçosa a marca `EXPIRED` e a nova reserva é
   criada.
4. Reserva `PENDING` ainda dentro do prazo **impede** uma nova reserva, com
   resposta `409` — sem isto, o teste 3 passaria com uma expiração ampla demais.

Na revisão de código, qualquer verificação de disponibilidade que dependa apenas
de leitura prévia sem a constraint por trás é achado bloqueante.

## Prós e contras das opções

### Só lock no Redis

* Boa, porque é rápido e simples de implementar.
* Ruim, porque a documentação oficial é explícita: numa instância única, o lock
  é um ponto único de falha, e com replicação assíncrona um failover pode
  conceder o mesmo lock duas vezes.
* Ruim, porque o lock expira por tempo: um processo lento pode continuar
  escrevendo depois de perder o lock, a menos que se implemente fencing token —
  complexidade que o banco resolve de graça.

### Só constraint no Postgres

* Boa, porque é correto e é o mínimo indispensável.
* Neutra, porque toda a contenção vira exceção de escrita.
* Ruim, porque sob concorrência alta no mesmo assento todas as requisições
  percorrem a transação inteira só para falhar no commit.

### Lock + constraint

* Boa, porque separa desempenho de correção, e cada camada pode falhar sem
  comprometer a outra.
* Neutra, porque exige mapear dois modos de falha para uma resposta só.
* Ruim, porque são duas peças de infraestrutura para manter e testar.

## Mais informações

* [Redis — Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/):
  a implementação correta com instância única, e por que soluções baseadas em
  failover não bastam.
* [Prisma — Indexes: partial indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes)
  e [release 7.4.0](https://github.com/prisma/prisma/releases/tag/7.4.0), que
  introduziu `partialIndexes` como preview feature.
* [PostgreSQL — `CREATE INDEX`](https://www.postgresql.org/docs/current/sql-createindex.html):
  toda função usada em definição de índice precisa ser `IMMUTABLE`, o que exclui
  `now()` do predicado e obriga a expiração explícita descrita na camada 3.
* Modelagem de assento: [ADR 0002](0002-usar-mapa-de-assentos.md).
* Se `partialIndexes` se mostrar instável, a alternativa é declarar o índice em
  SQL cru dentro da migration — mesma garantia, sem depender de preview feature.
