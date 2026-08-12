# Plan 0005 — Ingressos

Como a [spec 0005](spec.md) será implementada.

## Abordagem

O `qrcode.service.ts` é uma peça pura: assina e verifica, sem tocar em banco nem
em Express. Isso não é estilo — é o que torna a verificação da portaria possível
offline (RN-3) e o que permite testar forja com exaustão, barato.

O formato é o da seção 7 do `CLAUDE.md`:

```
payload   = { ticketId, eventId, code }
assinatura = HMAC-SHA256(JSON.stringify(payload), TICKET_SECRET)
qrContent  = base64url(payload) + "." + assinatura
```

A comparação da assinatura usa `timingSafeEqual`, como no hash de senha: comparar
com `===` vazaria, pelo tempo, quanto do palpite estava certo.

A emissão acontece **dentro da transação do pagamento**. Pagamento aprovado sem
ingresso emitido seria um cliente cobrado sem entrada — e a transação é o que
impede que uma falha entre as duas escritas produza exatamente isso.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/tickets/qrcode.service.ts` | criar | Assinar e verificar; sem I/O |
| `src/modules/tickets/tickets.schema.ts` | criar | Zod de saída e do código |
| `src/modules/tickets/tickets.repository.ts` | criar | Prisma de ingresso |
| `src/modules/tickets/tickets.service.ts` | criar | Listagem e consulta pública |
| `src/modules/tickets/tickets.routes.ts` | criar | Rotas |
| `src/modules/payments/payments.repository.ts` | alterar | Emitir o ingresso na transação |
| `src/shared/config/env.ts` | alterar | `TICKET_SECRET`, `APP_BASE_URL` |
| `src/app.ts`, `src/docs/swagger.ts` | alterar | Montagem e documentação |

## Contratos

### Endpoints

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| `GET` | `/tickets/mine` | `CUSTOMER` | Meus ingressos, com QR e link |
| `GET` | `/tickets/:code` | público | Ingresso por código — o link compartilhado |

### Saída

```ts
ticketSchema = z.object({
  id, code, status: "VALID" | "USED", qrContent, shareUrl,
  event: { id, title, date, venue },
  seatLabel, usedAt: nullable,
});

publicTicketSchema = ticketSchema.omit({ shareUrl: true });
```

A visão pública não traz nome nem e-mail do comprador (RN-7): o link é feito para
ser repassado, e repassar um ingresso não deveria repassar dados de quem comprou.

### Código do ingresso

18 bytes aleatórios em base32 legível, agrupados — algo como
`TKT-4F2K-9QX7-M3PD`. Aleatório porque sequencial é adivinhável (RN-2), e legível
porque a portaria do Épico 6 precisa poder digitá-lo quando a câmera falha.

## Modelo de dados

Sem migration: `Ticket` existe desde a spec 0001, com `code` único e
`qrSignature`. O campo guarda a assinatura; o `qrContent` completo é remontado na
leitura, para não duplicar no banco o que é derivável.

## Estratégia de testes

| Tipo | Alvo | Critérios |
| --- | --- | --- |
| Unitário | `qrcode.service` | CA-3, CA-4, CA-5, RN-4 |
| Unitário | gerador de código | CA-6, RN-2 |
| Integração | pagamento aprovado e recusado | CA-1, CA-2 |
| Integração | rotas de ingresso | CA-7, CA-8, CA-9, CA-10 |

O teste de forja não altera só um caractere: troca o payload inteiro mantendo a
assinatura, troca a assinatura mantendo o payload, e assina com outro segredo.
Um teste que só mexe num byte deixaria passar implementações que verificam mal.

## Riscos

| Risco | Mitigação |
| --- | --- |
| `TICKET_SECRET` ausente derruba a aplicação na primeira compra | Validado na partida, como o `JWT_SECRET` |
| Segredo trocado invalida ingressos emitidos | Documentado no README; rotação de segredo exigiria versionar a chave no payload, o que fica fora do escopo |
| Link compartilhado vaza ingresso | O código é aleatório e a visão pública não traz dados pessoais; quem tem o link tem o ingresso, que é o comportamento pedido |
