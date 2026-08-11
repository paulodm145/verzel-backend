# Plataforma de Eventos e Ingressos — Backend

Backend do desafio **Elite Dev 2026**: uma plataforma de eventos e ingressos com
três papéis de usuário.

- **Organizador** cria eventos a partir de um catálogo externo, definindo data,
  local, capacidade e preço.
- **Cliente** navega pelos eventos publicados, reserva um lugar, paga (simulado) e
  recebe um ingresso com QR Code.
- **Portaria** valida o ingresso na entrada, distinguindo válido, inválido, já
  utilizado e evento errado.

Dois requisitos concentram o risco do sistema e recebem tratamento explícito:
**nunca vender o mesmo lugar duas vezes** ([ADR 0003](docs/adr/0003-lock-redis-com-constraint-no-banco.md))
e **QR Code não falsificável** ([ADR 0004](docs/adr/0004-qrcode-com-assinatura-hmac.md)).

> **Status:** em desenvolvimento. O arcabouço de processo está pronto; a
> implementação começa pelo Épico 1.

## Como o projeto é construído

O desenvolvimento é **spec-driven**: cada épico do backlog começa por uma
especificação escrita, vira um plano técnico, depois um checklist de tarefas, e
só então código. Decisões arquiteturais são registradas como ADRs, com as
alternativas que foram descartadas.

O vocabulário vem do [spec-kit](https://github.com/github/spec-kit)
(constitution → spec → plan → tasks), adotado como markdown versionado, sem a
ferramenta — o projeto não precisa de mais um toolchain para escrever documento.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Stack, convenções de código, arquitetura em camadas e backlog |
| [`docs/constitution.md`](docs/constitution.md) | Princípios do projeto e critérios de decisão |
| [`docs/workflow.md`](docs/workflow.md) | Ciclo de branch, commit, PR e revisão |
| [`docs/adr/`](docs/adr/) | Decisões arquiteturais, com alternativas e consequências |
| [`docs/specs/`](docs/specs/) | Especificações por épico e roadmap |
| [`docs/templates/`](docs/templates/) | Modelos de spec, plan, tasks e ADR |

Quem quiser entender as escolhas técnicas antes do código deve começar pelos
[ADRs](docs/adr/): são cinco, curtos, e cobrem os pontos que o desafio pede para
justificar.

## Progresso

O estado de cada épico está no [roadmap de specs](docs/specs/README.md), e o
detalhe tarefa a tarefa no backlog do [`CLAUDE.md`](CLAUDE.md). Não é repetido
aqui de propósito: uma terceira cópia do mesmo status seria a primeira a
divergir.

## Setup

Instruções de instalação, Docker Compose, migrations, seed, credenciais de teste
e execução dos testes entram junto com o código, no Épico 1.

## Licença

[MIT](LICENSE).
