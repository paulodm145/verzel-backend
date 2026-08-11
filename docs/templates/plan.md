# Plan NNNN — {título}

Como a [spec NNNN](spec.md) será implementada. Este documento pode mudar durante
a implementação; a spec, não — se a spec precisar mudar, isso é uma decisão, não
um detalhe de execução.

## Abordagem

{Dois ou três parágrafos com a estratégia técnica. Se houver uma decisão
arquitetural relevante, ela vira um ADR em `docs/adr/` e é referenciada aqui em
vez de ser explicada por extenso.}

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/{...}` | criar \| alterar | {o que faz} |

## Contratos

### Endpoints

| Método | Rota | Papel exigido | Descrição |
| --- | --- | --- | --- |
| `POST` | `/{...}` | `CUSTOMER` | {...} |

### Schemas Zod

{Esboço dos schemas de entrada e saída. Pelo CLAUDE.md seção 16, os schemas Zod
são escritos antes do restante do módulo.}

## Modelo de dados

{Trechos do schema Prisma que entram ou mudam, incluindo índices e constraints.
Migration que exige SQL cru deve ser destacada aqui.}

## Estratégia de testes

| Tipo | Alvo | O que prova |
| --- | --- | --- |
| Unitário | `{...}.service` | {critério de aceite coberto} |
| Integração | `{rota}` | {critério de aceite coberto} |

Todo critério de aceite da spec precisa aparecer nesta tabela.

## Riscos

| Risco | Mitigação |
| --- | --- |
| {o que pode dar errado} | {como reduzir} |
