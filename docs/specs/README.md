# Especificações

Uma spec por épico do backlog (seção 14 do [`CLAUDE.md`](../../CLAUDE.md)). Cada
spec corresponde a uma branch e a um pull request, conforme o
[fluxo de trabalho](../workflow.md).

Cada diretório contém três documentos: `spec.md` (o problema e os critérios de
aceite), `plan.md` (a estratégia técnica) e `tasks.md` (o checklist que vira
commits).

## Roadmap

| # | Spec | Épico | Branch | Status |
| --- | --- | --- | --- | --- |
| 0000 | [Spec-driven development](0000-spec-driven-development/spec.md) | — | `docs/0000-spec-driven-development` | entregue |
| 0001 | [Fundação](0001-fundacao/spec.md) | 1 | `feat/0001-fundacao` | entregue |
| 0002 | [Autenticação](0002-autenticacao/spec.md) | 2 | `feat/0002-autenticacao` | entregue |
| 0003 | [Catálogo e eventos](0003-catalogo-eventos/spec.md) | 3 | `feat/0003-catalogo-eventos` | entregue |
| 0004 | [Reserva e pagamento](0004-reserva-pagamento/spec.md) | 4 | `feat/0004-reserva-pagamento` | entregue |
| 0005 | [Ingressos](0005-ingressos/spec.md) | 5 | `feat/0005-ingressos` | em revisão |
| 0006 | Portaria | 6 | `feat/0006-portaria` | não iniciada |
| 0007 | Qualidade e entrega | 7 | `chore/0007-qualidade-entrega` | não iniciada |

As specs de 0006 em diante ainda não existem como documento. São escritas
**just-in-time**, no início da branch do épico correspondente — uma spec redigida
seis branches antes da implementação envelhece contra decisões que ainda nem
foram tomadas.

A numeração das specs acompanha a dos épicos. A numeração dos
[ADRs](../adr/) é independente.
