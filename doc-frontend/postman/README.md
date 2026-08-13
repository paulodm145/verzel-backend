# Coleção do Postman

Dois arquivos:

| Arquivo | O que é |
| --- | --- |
| `verzel-api.postman_collection.json` | 28 requisições, em 7 pastas |
| `verzel-local.postman_environment.json` | Ambiente apontando para `http://localhost:3000` |

## Importar

**Postman** → `Import` → arraste os dois arquivos → selecione o ambiente
**"Verzel — local"** no seletor do canto superior direito.

Funciona igual no **Insomnia** (importa coleções v2.1) e no **Bruno**.

## Como usar

A coleção se autoconfigura. Rode nesta ordem:

1. **`1. Autenticação > Login (cliente)`** — o script de teste guarda
   `accessToken` e `refreshToken` nas variáveis da coleção. Todas as demais
   requisições passam a autenticar sozinhas.
2. **`3. Eventos > Listar publicados`** — guarda o `eventId` do primeiro evento.
3. **`3. Eventos > Mapa de assentos`** — escolhe um assento **livre** e guarda o
   `seatId`.
4. **`4. Reserva e pagamento > Reservar assento`** — gera uma `Idempotency-Key`
   nova automaticamente e guarda o `reservationId`.
5. **`4. … > Pagar (recusado)`** e depois **`Pagar (aprovado)`** — nesta ordem: o
   recusado deixa a reserva pendente para nova tentativa, e o aprovado confirma
   e emite o ingresso. Ao contrário, o segundo responderia 409, porque reserva
   já paga não é paga de novo.
6. **`5. Ingressos > Meus ingressos`** — guarda o `ticketCode`.
7. **`6. Portaria > Validar por código`** — precisa de um token de portaria:
   rode antes `1. Autenticação > Login (portaria)`.

Rodar `Validar por código` duas vezes mostra a diferença entre `VALID` e
`ALREADY_USED`, que é o comportamento mais interessante de demonstrar.

As requisições de **editar, publicar e cancelar** operam sobre `meuEventoId` — o
evento que a própria coleção cria — e não sobre o `eventId` das rotas públicas.
Sem essa separação, rodar a coleção inteira no Collection Runner cancelaria o
evento do seed, e o fluxo de reserva pararia de funcionar.

A requisição **Criar evento** gera uma data nova a cada execução: o mesmo
organizador não pode repetir o mesmo item de catálogo na mesma data, e o evento
do seed já ocupa uma. Sem isso, a segunda execução responderia 409.

## Trocar de papel

As três requisições de login sobrescrevem o mesmo `accessToken`. Para agir como
organizador, rode `Login (organizador)`; para a portaria, `Login (portaria)`.
Não há como manter dois papéis ativos ao mesmo tempo na mesma coleção — use duas
abas de ambiente se precisar.

## Variáveis

| Variável | Preenchida por |
| --- | --- |
| `baseUrl` | Você (padrão `http://localhost:3000`) |
| `accessToken`, `refreshToken` | Scripts de login e renovação |
| `eventId` | Listar eventos — usado pelas rotas públicas e pela reserva |
| `meuEventoId` | Criar evento — usado por editar, publicar e cancelar |
| `seatId` | Mapa de assentos (escolhe um livre) |
| `reservationId` | Reservar assento |
| `ticketCode` | Meus ingressos |
| `idempotencyKey` | Gerada antes de cada reserva e pagamento |

## Se algo responder 401

O token de acesso dura 15 minutos. Rode `Login` de novo, ou
`1. Autenticação > Renovar sessão` — mas **uma vez só**: renovar duas vezes com o
mesmo token derruba todas as sessões do usuário, de propósito. Ver
[`../02-autenticacao.md`](../02-autenticacao.md).
