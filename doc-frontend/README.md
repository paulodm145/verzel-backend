# Documentação de integração — API Verzel

Esta pasta é **autocontida**: copie-a inteira para dentro do projeto do
frontend. Ela descreve todas as rotas, os payloads, os retornos e as armadilhas
de integração da API de eventos e ingressos.

## Índice

| Documento | Conteúdo |
| --- | --- |
| [`01-comecando.md`](01-comecando.md) | Base URL, CORS, cliente HTTP mínimo, ambiente |
| [`02-autenticacao.md`](02-autenticacao.md) | Cadastro, login, renovação, papéis — e a regra que derruba sessões |
| [`03-eventos-e-catalogo.md`](03-eventos-e-catalogo.md) | Catálogo externo, CRUD de evento, listagem pública, mapa de assentos |
| [`04-reserva-e-pagamento.md`](04-reserva-e-pagamento.md) | O fluxo de compra e o uso correto de `Idempotency-Key` |
| [`05-ingressos-e-portaria.md`](05-ingressos-e-portaria.md) | QR Code, link compartilhável, validação na entrada |
| [`06-erros-e-convencoes.md`](06-erros-e-convencoes.md) | Formato de erro, códigos, paginação, datas, dinheiro |
| [`07-performance.md`](07-performance.md) | Como integrar sem estourar chamadas, travar tela ou perder sessão |
| [`postman/`](postman/) | Coleção pronta para importar |

## Comece por aqui

1. Suba o backend: `docker compose up -d && npm run db:migrate && npm run db:seed && npm run dev`
2. Importe a coleção do Postman (instruções em [`postman/README.md`](postman/README.md))
3. Leia [`01-comecando.md`](01-comecando.md) e [`07-performance.md`](07-performance.md) — o
   segundo evita os três erros que custam mais tempo

## Os três papéis

| Papel | Faz | Como se obtém |
| --- | --- | --- |
| `CUSTOMER` | Navega, reserva, paga, vê os próprios ingressos | Cadastro público |
| `ORGANIZER` | Busca no catálogo, cria e gerencia eventos | Apenas pelo seed |
| `GATE` | Valida ingresso na entrada | Apenas pelo seed |

O cadastro público **sempre** cria `CUSTOMER`. Mandar `role` no corpo não muda
nada — o campo é descartado antes de chegar à regra de negócio. Não construa
tela de "escolha seu perfil" no cadastro.

## Credenciais de teste

Criadas por `npm run db:seed`:

| Papel | E-mail | Senha |
| --- | --- | --- |
| `ORGANIZER` | `organizador@verzel.test` | `organizador123` |
| `CUSTOMER` | `cliente1@verzel.test` | `cliente123` |
| `CUSTOMER` | `cliente2@verzel.test` | `cliente123` |
| `GATE` | `portaria@verzel.test` | `portaria123` |

O seed também deixa **um evento publicado com 30 assentos** e **um ingresso
válido** — dá para montar todas as telas sem criar nada à mão.

## Contrato vivo

A API serve a própria documentação em `http://localhost:3000/docs` (Swagger UI)
e `http://localhost:3000/docs.json` (OpenAPI). Os schemas de lá são gerados dos
mesmos objetos que validam a entrada, então **nunca divergem do código**. Estes
arquivos aqui explicam o *como usar*; o `/docs.json` é a fonte para gerar
tipos ou client.
