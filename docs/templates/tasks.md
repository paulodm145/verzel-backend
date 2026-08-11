# Tasks NNNN — {título}

Quebra do [plan NNNN](plan.md) em unidades que viram commits atômicos. Cada tarefa
já traz a mensagem de commit pretendida, no padrão da seção 15 do CLAUDE.md.

Uma tarefa está pronta quando o código existe, os testes dela passam e o build
não quebra — nunca antes.

## Tarefas

- [ ] **T-1** — {descrição}
  - Commit: `feat(escopo): {descrição no imperativo}`
  - Cobre: CA-1, RN-2
  - Testes: {quais}

- [ ] **T-2** — {descrição}
  - Commit: `test(escopo): {descrição no imperativo}`
  - Cobre: CA-3
  - Testes: {quais}

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-1 |
| CA-2 | T-2 |

Nenhum critério de aceite pode ficar sem tarefa correspondente.

## Definição de pronto do épico

- [ ] Todos os critérios de aceite da spec cobertos por teste automatizado
- [ ] `npm run lint` e `npm run typecheck` sem erro
- [ ] `npm test` verde
- [ ] Endpoints novos documentados no Swagger
- [ ] Checkbox correspondente marcado no backlog do `CLAUDE.md`
- [ ] Nenhum segredo commitado
