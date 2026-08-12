# Decisões arquiteturais

Registros de decisão arquitetural (ADRs) no formato
[MADR 4.0](https://adr.github.io/madr/). O critério para o que merece um ADR está
no princípio 2 da [constituição](../constitution.md).

| # | Decisão | Status | Data |
| --- | --- | --- | --- |
| [0001](0001-registrar-decisoes-em-madr.md) | Registrar decisões arquiteturais como ADRs em formato MADR | accepted | 2026-08-11 |
| [0002](0002-usar-mapa-de-assentos.md) | Modelar lugares como mapa de assentos, não como contador de capacidade | accepted | 2026-08-11 |
| [0003](0003-lock-redis-com-constraint-no-banco.md) | Lock no Redis como otimização, constraint no Postgres como garantia | accepted | 2026-08-11 |
| [0004](0004-qrcode-com-assinatura-hmac.md) | QR Code como payload assinado com HMAC-SHA256 | accepted | 2026-08-11 |
| [0005](0005-adapter-para-catalogo-externo.md) | Isolar o catálogo externo atrás de um Adapter | accepted | 2026-08-11 |
| [0006](0006-fixar-typescript-na-linha-6.md) | Fixar TypeScript na linha 6.x, apesar de a 7 ser a versão corrente | accepted | 2026-08-11 |
| [0007](0007-openapi-nativo-do-zod.md) | Gerar o OpenAPI com o conversor nativo do Zod, sem lib de bridge | accepted | 2026-08-11 |
| [0008](0008-vitest-como-runner-de-testes.md) | Vitest como runner de testes | accepted | 2026-08-11 |
| [0009](0009-hash-de-senha-com-scrypt-nativo.md) | Derivar hash de senha com o scrypt do node:crypto | accepted | 2026-08-12 |
| [0010](0010-refresh-token-opaco-com-rotacao.md) | Token de renovação opaco, com rotação e detecção de reuso | accepted | 2026-08-12 |

## Como adicionar um ADR

```bash
cp docs/templates/adr.md docs/adr/0011-titulo-em-kebab-case.md
```

Preencher, acrescentar a linha nesta tabela e commitar junto da branch do épico
que motivou a decisão.

Decisão superada não é editada nem removida: seu status vira
`superseded by ADR-NNNN` e o ADR novo explica o que mudou. O valor do registro
está em poder reconstruir o raciocínio de então, inclusive quando ele se provou
errado.
