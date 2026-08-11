---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0001. Registrar decisões arquiteturais como ADRs em formato MADR

## Contexto e problema

O desafio Elite Dev 2026 avalia explicitamente as escolhas técnicas e a
justificativa por trás delas, não só o código final. Várias decisões deste
projeto — estratégia contra overselling, integridade do QR Code, isolamento da
API externa — só fazem sentido quando se conhece as alternativas que foram
descartadas. Onde registrar essa justificativa de forma que ela sobreviva à
leitura rápida do código?

## Forças da decisão

* O avaliador precisa entender o *porquê* sem reconstruí-lo a partir do diff.
* Comentário no código explica a linha, não a escolha entre arquiteturas.
* README que acumula justificativas cresce até ninguém mais ler.
* O formato precisa ser leve o bastante para não virar burocracia num projeto de
  prazo curto.

## Opções consideradas

* ADRs em arquivos markdown no repositório, formato MADR
* Uma seção "Decisões técnicas" no README
* Comentários extensos no código, junto da implementação

## Decisão

Escolhida a opção "ADRs em formato MADR", porque cada decisão fica num arquivo
próprio, imutável e datado, com as alternativas descartadas ao lado da escolhida
— e porque o MADR já resolveu o problema de qual estrutura usar, evitando
inventar um formato caseiro.

Adotado o [MADR 4.0](https://adr.github.io/madr/), traduzido para português,
com duas restrições a mais que o original: a seção de consequências exige ao
menos uma consequência negativa, e a seção de confirmação, opcional no MADR,
aqui é obrigatória.

### Consequências

* Boa, porque a justificativa fica versionada junto do código que ela justifica,
  e o `git log` mostra quando cada decisão foi tomada.
* Boa, porque forçar a listar alternativas descartadas expõe decisões que na
  verdade nunca foram decididas — só aconteceram.
* Ruim, porque acrescenta trabalho de escrita a cada decisão relevante, e um ADR
  desatualizado é pior que ADR nenhum: ele mente com autoridade.
* Ruim, porque exige disciplina para distinguir decisão arquitetural de simples
  convenção — sem esse critério, o diretório vira depósito.

### Confirmação

Todo `plan.md` que justificar uma escolha entre alternativas precisa referenciar
um ADR em vez de argumentar por extenso. Na revisão do PR, argumentação
arquitetural encontrada dentro de um plan ou de um comentário de código é
apontada como achado e extraída para ADR.

Uma decisão superada não é editada nem apagada: ganha status `superseded` e um
ADR novo que a substitui.

## Prós e contras das opções

### ADRs em formato MADR

* Boa, porque o formato é conhecido e não precisa ser explicado ao leitor.
* Boa, porque um arquivo por decisão permite marcar `superseded` sem reescrever
  história.
* Neutra, porque exige numeração sequencial manual.
* Ruim, porque o template completo é verboso para decisões pequenas.

### Seção no README

* Boa, porque é o primeiro lugar onde qualquer pessoa olha.
* Ruim, porque não há como registrar que uma decisão foi substituída — o texto
  antigo simplesmente some, e com ele o motivo da mudança.
* Ruim, porque o README cresce até a seção deixar de ser lida.

### Comentários no código

* Boa, porque fica ao lado da implementação.
* Ruim, porque decisão que atravessa vários módulos não tem onde morar.
* Ruim, porque comentário some no refactor.

## Mais informações

* [MADR — About](https://adr.github.io/madr/)
* [ADR templates](https://adr.github.io/adr-templates/)
* Template adaptado em [`docs/templates/adr.md`](../templates/adr.md)
* Critério para o que merece ADR: princípio 2 da
  [constituição](../constitution.md)
