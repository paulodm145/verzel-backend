# Spec 0000 — Arcabouço de spec-driven development

| | |
| --- | --- |
| **Épico** | — (precede o Épico 1) |
| **Branch** | `docs/0000-spec-driven-development` |
| **Status** | approved |

## Problema

O repositório começou com o `CLAUDE.md` definindo stack, convenções, arquitetura
e backlog, e nada além disso: nenhum commit, nenhuma estrutura, nenhum processo.
O `CLAUDE.md` responde *o que* construir, mas não responde como o trabalho sai do
backlog e chega mergeado — onde os requisitos de um épico são escritos antes de
virarem código, onde as decisões arquiteturais ficam registradas com as
alternativas que foram descartadas, e como cada entrega é revisada.

Sem isso, o projeto até funciona, mas o desafio Elite Dev 2026 avalia o processo
mostrado — histórico de commits e justificativa das escolhas — e um repositório
que só exibe o resultado final perde exatamente aquilo que está sendo medido.

## Escopo

### Entra

* Constituição: princípios do projeto e critério para o que vira decisão
  registrada.
* Fluxo de trabalho: o ciclo spec → plan → tasks → commits → PR → review → merge,
  com convenções de nome de branch, spec, ADR e PR.
* Templates de `spec.md`, `plan.md`, `tasks.md` e ADR.
* Os ADRs das decisões já tomadas, incluindo a de assento versus pista, que o
  `CLAUDE.md` deixava em aberto.
* Roadmap ligando cada épico à sua spec, branch e PR.
* Template de pull request que obriga a linkar a spec correspondente.
* Higiene do repositório: `.gitignore`, `.editorconfig`, licença e README.

### Não entra

* Qualquer código de aplicação, `package.json`, `tsconfig`, schema Prisma ou
  `docker-compose.yml` — tudo isso é a spec 0001 (Fundação).
* As specs dos épicos 1 a 7, escritas just-in-time no início de cada branch.
* Integração contínua; se for adotada, entra no Épico 7.

## Regras de negócio

1. **RN-1** — Cada épico do backlog corresponde a exatamente uma spec, uma branch
   e um pull request.
2. **RN-2** — Nenhuma implementação começa antes de a spec do épico estar escrita
   e commitada.
3. **RN-3** — Escolha entre alternativas com consequência duradoura vira ADR;
   convenção de código permanece no `CLAUDE.md`.
4. **RN-4** — Merge de PR é feito com `--no-ff`. Squash é proibido, porque
   colapsaria os commits atômicos que constituem a evidência do processo.
5. **RN-5** — Todo PR passa por revisão registrada no próprio PR antes do merge.
6. **RN-6** — Todo ADR declara ao menos uma consequência negativa e uma forma de
   confirmar a conformidade com a decisão.
7. **RN-7** — Especificações vivem em `docs/specs/`, independentemente da
   ferramenta que as produziu.

## Critérios de aceite

* **CA-1** — Dado o repositório na branch `main`, quando alguém abre o `README.md`,
  então encontra o caminho para constituição, workflow, ADRs e specs.
* **CA-2** — Dado um desenvolvedor iniciando um épico, quando ele segue
  `docs/workflow.md`, então executa o ciclo completo sem precisar de informação
  que não esteja no repositório.
* **CA-3** — Dado o diretório `docs/adr/`, quando se lê o índice, então cada
  decisão arquitetural já tomada tem ADR correspondente, com alternativas
  descartadas e consequências negativas explícitas.
* **CA-4** — Dado que alguém abre um pull request, quando usa o template, então é
  obrigado a informar a spec relacionada e a percorrer o checklist de entrega.
* **CA-5** — Dado o `.gitignore`, quando um `.env` existe no diretório de
  trabalho, então ele não aparece como arquivo rastreável.
* **CA-6** — Dados os templates, quando são copiados para uma spec nova, então
  todo critério de aceite tem tarefa correspondente e toda tarefa tem mensagem de
  commit pretendida.

Estes critérios são verificados por leitura na revisão do PR, não por teste
automatizado: a entrega é documentação, e não há código para exercitar.

## Casos de erro

Não se aplica: esta entrega não expõe comportamento de runtime.

## Perguntas em aberto

Nenhuma.

## Referências

* [`CLAUDE.md`](../../../CLAUDE.md) — stack, convenções e backlog
* [MADR 4.0](https://adr.github.io/madr/) — formato dos ADRs
* [spec-kit](https://github.com/github/spec-kit) — origem do vocabulário
  constitution → spec → plan → tasks, adotado sem a ferramenta
