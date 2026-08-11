# Fluxo de trabalho

O ciclo operacional do projeto: como um item do backlog vira código mergeado.
Os princípios por trás destas regras estão em [`constitution.md`](constitution.md).

## Unidade de trabalho: o épico

Cada épico do backlog (seção 14 do [`CLAUDE.md`](../CLAUDE.md)) corresponde a
**uma spec, uma branch e um pull request**. Dentro do PR, cada checkbox do
backlog vira um ou mais commits atômicos.

O épico foi escolhido como unidade porque é a menor fatia que entrega algo
testável de ponta a ponta. Uma branch por checkbox produziria PRs sem sentido
isolado — "schema Zod" sem o service que o consome não é revisável.

| Épico | Spec | Branch |
| --- | --- | --- |
| 1 — Fundação | `0001-fundacao` | `feat/0001-fundacao` |
| 2 — Autenticação | `0002-autenticacao` | `feat/0002-autenticacao` |
| 3 — Catálogo e eventos | `0003-catalogo-eventos` | `feat/0003-catalogo-eventos` |
| 4 — Reserva e pagamento | `0004-reserva-pagamento` | `feat/0004-reserva-pagamento` |
| 5 — Ingressos | `0005-ingressos` | `feat/0005-ingressos` |
| 6 — Portaria | `0006-portaria` | `feat/0006-portaria` |
| 7 — Qualidade e entrega | `0007-qualidade-entrega` | `chore/0007-qualidade-entrega` |

## O ciclo

### 1. Abrir a branch

```bash
git switch main && git pull
git switch -c feat/0002-autenticacao
```

Convenção de nome: `<tipo>/<NNNN>-<slug-kebab>`, com `<tipo>` sendo um dos tipos
de commit da seção 15 do CLAUDE.md.

### 2. Escrever a spec

Copiar os templates para `docs/specs/NNNN-slug/` e preencher **nesta ordem**:

```bash
mkdir -p docs/specs/0002-autenticacao
cp docs/templates/{spec,plan,tasks}.md docs/specs/0002-autenticacao/
```

- `spec.md` — o problema, as regras de negócio e os critérios de aceite. Sem
  tecnologia.
- `plan.md` — a estratégia técnica, os contratos, o modelo de dados e a
  estratégia de testes.
- `tasks.md` — o checklist executável, com a mensagem de commit de cada tarefa.

Especificações são escritas **just-in-time**, no início da branch do épico. Uma
spec redigida seis branches antes da implementação é ficção: ela envelhece contra
decisões que ainda nem foram tomadas.

A spec vira um commit próprio antes de qualquer implementação:

```bash
git commit -m "docs(auth): especificar cadastro, login e emissão de tokens"
```

### 3. Decidir o que precisa de ADR

Se ao escrever o `plan.md` você se pegar justificando uma escolha entre
alternativas, isso é um ADR — extraia para `docs/adr/NNNN-titulo.md` e referencie
no plan. Ver o critério no princípio 2 da constituição.

### 4. Implementar

Uma tarefa do `tasks.md` por vez, marcando o checkbox conforme avança. Cada
tarefa termina em commit atômico que não quebra o build nem os testes existentes.

Pela seção 16 do CLAUDE.md, os schemas Zod do módulo vêm antes do restante.

### 5. Abrir o pull request

```bash
git push -u origin feat/0002-autenticacao
gh pr create --base main --title "feat(auth): implementar cadastro e login" \
             --body-file .github/pull_request_template.md --draft
```

E então preencher o corpo no GitHub. **Não usar `gh pr create --fill`**: essa
flag monta o corpo a partir das mensagens de commit e ignora o
[template](../.github/pull_request_template.md), produzindo um PR sem a seção
"Spec relacionada" e sem o checklist. Alternativa equivalente: `gh pr create
--web`, que abre o formulário já com o template carregado.

O PR nasce como draft e vira ready quando o épico estiver completo.

### 6. Revisar

Antes do merge, revisão pelo skill `/code-review`, publicando os achados como
comentários inline no PR:

```
/code-review --comment
```

Cada achado aceito vira um commit `fix:` na mesma branch, respondendo ao
comentário. Achado recusado é respondido no PR com o motivo técnico — recusar com
argumento é parte do review, aceitar tudo não é.

O review fica registrado no PR de propósito: é a evidência de que a revisão
aconteceu, e o desafio avalia o processo mostrado.

### 7. Fechar o épico

Percorrer a "definição de pronto" do `tasks.md`. Só então:

```bash
gh pr merge --merge --delete-branch
```

`--merge` e não `--squash`. O squash colapsaria os commits atômicos em um só,
destruindo o histórico que o projeto se propôs a mostrar.

Depois do merge, marcar o checkbox do épico no backlog do CLAUDE.md.

## Convenções de nome

| Artefato | Padrão | Exemplo |
| --- | --- | --- |
| Branch | `<tipo>/<NNNN>-<slug>` | `feat/0004-reserva-pagamento` |
| Diretório de spec | `<NNNN>-<slug>` | `docs/specs/0004-reserva-pagamento/` |
| ADR | `<NNNN>-<slug>.md` | `docs/adr/0003-lock-redis-com-constraint-no-banco.md` |
| Commit | `<tipo>(<escopo>): <imperativo>` | `feat(reservations): adicionar lock no Redis` |
| PR | mesma forma do commit | `feat(auth): implementar cadastro e login` |

A numeração de ADR e de spec é sequencial e independente, e as duas séries não
se correspondem. As specs acompanham os épicos, e a 0000 é reservada ao
arcabouço que precede o Épico 1. Os ADRs começam em 0001.

## Nota sobre ferramental

Este projeto usa o plugin `superpowers`, cujos skills `brainstorming` e
`writing-plans` gravam por padrão em `docs/superpowers/specs/`. **Neste
repositório, o destino é `docs/specs/`** — um único lugar para especificação,
independente da ferramenta que a produziu.
