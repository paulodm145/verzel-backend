# Spec NNNN — {título}

| | |
| --- | --- |
| **Épico** | {número e nome do épico no backlog do CLAUDE.md} |
| **Branch** | `{tipo}/NNNN-{slug}` |
| **Status** | draft \| approved \| implemented |

## Problema

{Que necessidade real isto atende, do ponto de vista de quem usa o sistema. Sem
mencionar tecnologia — tecnologia é assunto do `plan.md`.}

## Escopo

### Entra

* {capacidade 1}
* {capacidade 2}

### Não entra

* {o que explicitamente fica de fora, e para qual spec vai}

## Regras de negócio

{Numeradas, para que os critérios de aceite e os testes possam referenciá-las.}

1. **RN-1** — {regra}
2. **RN-2** — {regra}

## Critérios de aceite

{Um por comportamento observável, em Dado/Quando/Então. Cada critério precisa ser
verificável por um teste automatizado — se não der para testar, ou é vago demais
ou não é critério de aceite.}

* **CA-1** — Dado {contexto}, quando {ação}, então {resultado observável}.
* **CA-2** — Dado {contexto}, quando {ação}, então {resultado observável}.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| {entrada inválida} | {status HTTP e corpo} |

## Perguntas em aberto

* {questão que precisa ser resolvida antes ou durante a implementação — deve
  estar vazia quando o status virar `approved`}

## Referências

* {seção do CLAUDE.md, ADR relacionado, documentação oficial consultada}
