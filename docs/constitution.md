# Constituição do projeto

Princípios que valem para todo o projeto e não mudam de um épico para outro.

Este documento responde **como decidimos**. O [`CLAUDE.md`](../CLAUDE.md) responde
**o que foi decidido** — stack, convenções de código, arquitetura em camadas,
modelagem e backlog. Os dois não se duplicam: quando houver conflito entre um
princípio daqui e uma regra do CLAUDE.md, o CLAUDE.md vence, porque ele é o
documento que descreve este sistema em concreto.

## Princípios

### 1. Nada é implementado antes de estar especificado

Todo épico começa por uma spec que descreve o problema e os critérios de aceite,
antes de qualquer linha de código. Critério de aceite que não pode virar teste
automatizado não é critério de aceite — é uma intenção mal formulada.

### 2. Decisão arquitetural vira ADR, não comentário no código

Quando existe mais de um caminho razoável e a escolha tem consequência duradoura,
a decisão é registrada em [`docs/adr/`](adr/) com as alternativas que foram
descartadas e o motivo. Um ADR sem consequência negativa listada é sinal de que o
problema não foi entendido de verdade.

O que não é decisão arquitetural: escolha de nome de variável, ordem de
parâmetros, formatação. Isso é convenção de código e mora no CLAUDE.md.

### 3. O histórico do repositório é parte da entrega

O desafio avalia o processo mostrado, não só o resultado. Por isso:

- commits atômicos e semânticos, no padrão da seção 15 do CLAUDE.md;
- merge de PR com `--no-ff`, **nunca** squash — squash apagaria exatamente a
  evidência que o histórico deveria carregar;
- mensagem de commit que explica o *porquê*, já que o *o quê* está no diff.

### 4. A garantia fica no ponto mais baixo possível

Regra de integridade se declara no banco (constraint, índice único, update
condicional atômico), não na aplicação. Lock distribuído, validação de entrada e
checagem em service são camadas de conveniência e de mensagem de erro; a última
palavra é sempre do Postgres. O sistema tem que continuar correto com o Redis
fora do ar — mais lento e recusando requisições, mas nunca vendendo o mesmo lugar
duas vezes.

### 5. Fonte de pesquisa é a documentação oficial

Comportamento de biblioteca ou ferramenta se confirma na documentação oficial da
própria biblioteca, com o link registrado no ADR ou no plan que dependeu dele.
Não se decide por memória nem por post de blog quando existe documentação
primária.

### 6. Dependência nova exige justificativa

Antes de instalar um pacote, verificar se o que já está no stack resolve. Toda
dependência é superfície de manutenção, de segurança e de build. Quando a
instalação se justificar, o motivo entra na mensagem do commit `chore`.

### 7. YAGNI

Implementar o que a spec pede, no escopo do épico. Abstração criada "porque um dia
pode ser útil" é custo certo contra benefício hipotético. A exceção é onde o
próprio CLAUDE.md já determinou a abstração — como o Adapter de catálogo da seção
9, que existe porque o requisito de trocar de fonte de dados é conhecido desde o
início.

### 8. Segredo nunca entra no repositório

`TICKET_SECRET`, segredo de JWT, credenciais de API externa e `.env` ficam fora do
versionamento. O que é versionado é o `.env.example`, com as chaves e sem os
valores.

## Hierarquia de documentos

```
CLAUDE.md          stack, convenções, arquitetura, backlog      (o que foi decidido)
docs/constitution  princípios e critérios de decisão            (como decidimos)
docs/workflow.md   o ciclo operacional de branch/PR/review      (como executamos)
docs/adr/          decisões pontuais, com alternativas          (por que assim)
docs/specs/        requisitos e plano por épico                 (o que construir agora)
```
