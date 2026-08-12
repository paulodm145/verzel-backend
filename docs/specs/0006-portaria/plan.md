# Plan 0006 — Portaria

Como a [spec 0006](spec.md) será implementada.

## Abordagem

A validação tem uma ordem que não é acidental:

1. **Assinatura primeiro.** QR forjado é recusado sem tocar no banco (RN-2). Não
   é só desempenho: é o que permite recusar forja mesmo com o banco lento, e o
   que impede que um atacante use a porta como oráculo para descobrir códigos
   válidos.
2. **Depois o banco**, para saber se existe, de qual evento é, e se já entrou.
3. **A marcação de uso é a própria checagem.** Não se lê o status para depois
   gravá-lo — `updateMany({ where: { id, status: "VALID" } })` devolve quantas
   linhas mudaram, e zero significa que outro portão chegou primeiro (RN-3).

Ler-e-então-gravar aqui teria o mesmo defeito que a reserva tinha antes do lock,
com um agravante: dois portões diferentes, dois processos diferentes, nenhuma
chance de o JavaScript salvar a lógica por ser single-threaded.

O código digitado e o QR entram pelo mesmo caminho: o QR é decodificado para um
código, e daí em diante é o mesmo fluxo. Assim a portaria digitando à mão exerce
exatamente o código que o leitor exerce.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/gate/gate.schema.ts` | criar | Zod da entrada e do resultado |
| `src/modules/gate/gate.repository.ts` | criar | Consulta e marcação atômica |
| `src/modules/gate/gate.service.ts` | criar | A ordem das checagens |
| `src/modules/gate/gate.controller.ts` · `.routes.ts` | criar | Borda HTTP |
| `src/app.ts`, `src/docs/swagger.ts` | alterar | Montagem e documentação |

## Contratos

### Endpoints

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| `POST` | `/gate/validate` | `GATE` | Valida e marca uso |
| `GET` | `/gate/tickets/:code` | `GATE` | Consulta sem marcar uso |

### Entrada e saída

```ts
validateSchema = z
  .object({
    qrContent: z.string().min(1).optional(),
    code: z.string().trim().toUpperCase().min(4).max(40).optional(),
    eventId: z.uuid(),
  })
  .refine((body) => Boolean(body.qrContent ?? body.code), {
    message: "Informe o conteúdo do QR ou o código do ingresso",
  });

validationResultSchema = z.object({
  result: z.enum(["VALID", "INVALID", "ALREADY_USED", "WRONG_EVENT"]),
  message: z.string(),
  ticket: z.object({ code, seatLabel, eventTitle }).nullable(),
  usedAt: z.iso.datetime().nullable(),
});
```

O `eventId` é obrigatório porque é ele que torna `WRONG_EVENT` possível: sem
saber em que porta o leitor está, não há como distinguir um ingresso de outro
evento de um ingresso legítimo (RN-5).

A resposta sempre traz `message` em português, pronta para a tela do operador —
quem está na porta não deve precisar traduzir um código em inglês na hora.

## Modelo de dados

Sem migration. `Ticket` já tem `status`, `usedAt` e `usedByGateUserId`.

## Estratégia de testes

| Tipo | Alvo | Critérios |
| --- | --- | --- |
| Unitário | `gate.service` com repositório falso | CA-3, CA-4, CA-5, CA-9 |
| Integração | validação completa contra o banco | CA-1, CA-2, CA-8, CA-10 |
| Integração | duas validações simultâneas | CA-6, RN-4 |
| Integração | papéis | CA-7 |

O teste de concorrência da portaria é o irmão do teste de reserva: duas
validações do mesmo ingresso disparadas juntas, contra Postgres real, exigindo
exatamente um `VALID`.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Portaria usada como oráculo de códigos válidos | A checagem de assinatura vem antes de qualquer consulta, e as respostas não revelam por que a assinatura falhou |
| Operador confunde "inválido" com "já usado" | São resultados distintos, com mensagem própria, e o teste cobre os quatro |
| Dois portões validando ao mesmo tempo | Marcação atômica com contagem de linhas afetadas; teste de concorrência |
