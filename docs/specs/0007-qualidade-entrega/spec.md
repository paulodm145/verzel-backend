# Spec 0007 — Qualidade e entrega

| | |
| --- | --- |
| **Épico** | 7 — Qualidade e entrega |
| **Branch** | `chore/0007-qualidade-entrega` |
| **Status** | approved |

## Problema

O backend está completo, mas quem for avaliá-lo precisa conseguir usá-lo em
minutos, sem ler código para descobrir por onde começar. E o frontend, que ainda
será construído, precisa de dados de verdade no banco desde o primeiro `npm run
dev` — não de um banco vazio que só ganha vida depois de dez chamadas manuais.

O desafio também avalia explicitamente o **processo**: as decisões tomadas, o
que foi feito com IA e o que foi decidido manualmente.

## Escopo

### Entra

* Seed completo: os quatro usuários, um evento publicado com assentos, e uma
  compra já concluída com ingresso emitido.
* README final: setup, fluxo de uso ponta a ponta, credenciais, decisões
  arquiteturais e a seção sobre uso de IA.
* Revisão final de nomenclatura e camadas.

### Não entra

* Novas funcionalidades.
* Frontend.

## Regras de negócio

1. **RN-1** — O seed é idempotente: rodar duas vezes não duplica nada.
2. **RN-2** — O seed não depende de rede: o evento nasce de dados fixos, não de
   uma chamada ao catálogo externo.
3. **RN-3** — Nenhum segredo real no repositório.

## Critérios de aceite

* **CA-1** — Dado o banco migrado e vazio, quando se roda o seed, então existem
  quatro usuários, um evento publicado com assentos livres, e um ingresso `VALID`
  pronto para validar na portaria.
* **CA-2** — Dado o seed já rodado, quando ele roda de novo, então nada é
  duplicado.
* **CA-3** — Dado o ingresso criado pelo seed, quando a portaria o valida, então
  a entrada é liberada.
* **CA-4** — Dado o README, quando alguém o segue do zero, então chega a um
  ingresso validado sem precisar ler código.

## Referências

* Seções 13 e 16 do [`CLAUDE.md`](../../../CLAUDE.md).
