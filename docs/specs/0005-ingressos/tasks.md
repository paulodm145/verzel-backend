# Tasks 0005 — Ingressos

Quebra do [plan 0005](plan.md) em commits atômicos.

## Tarefas

- [ ] **T-1** — `qrcode.service.ts` e as variáveis `TICKET_SECRET` e
      `APP_BASE_URL`.
  - Commit: `feat(tickets): assinar e verificar o conteúdo do QR Code`
  - Cobre: CA-3, CA-4, CA-5, CA-6, RN-2, RN-3, RN-4, RN-5
  - Testes: unitário — assinatura válida verifica; payload alterado, assinatura
    trocada e outro segredo são recusados; códigos não repetem

- [ ] **T-2** — Emissão do ingresso na transação do pagamento aprovado.
  - Commit: `feat(tickets): emitir o ingresso junto da confirmação do pagamento`
  - Cobre: CA-1, CA-2, RN-1
  - Testes: integração — aprovado emite, recusado não emite

- [ ] **T-3** — Repositório, service e rotas de ingresso.
  - Commit: `feat(tickets): listar os próprios ingressos e consultar por código`
  - Cobre: CA-7, CA-8, CA-9, CA-10, RN-6, RN-7
  - Testes: integração — dono vê os seus; visão pública sem dados pessoais;
    código inexistente dá 404

- [ ] **T-4** — Documentar ingressos no OpenAPI.
  - Commit: `feat(docs): documentar as rotas de ingresso`
  - Cobre: —
  - Testes: integração — rotas no `/docs.json`

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-2 |
| CA-2 | T-2 |
| CA-3 | T-1 |
| CA-4 | T-1 |
| CA-5 | T-1 |
| CA-6 | T-1 |
| CA-7 | T-3 |
| CA-8 | T-3 |
| CA-9 | T-3 |
| CA-10 | T-3 |

## Definição de pronto do épico

- [ ] Os dez critérios cobertos por teste automatizado
- [ ] `npm run lint`, `npm run typecheck` e `npm test` sem erro
- [ ] Rotas novas no `/docs`
- [ ] Checkbox do Épico 5 no backlog, e status no roadmap
- [ ] `TICKET_SECRET` no `.env.example`, sem valor real
