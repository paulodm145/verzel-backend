# 7. Performance e integração eficiente

Ordenado por impacto. Os três primeiros itens evitam bugs, não só lentidão.

## 1. Uma renovação de sessão por vez

**Duas chamadas simultâneas a `/auth/refresh` deslogam o usuário de todos os
dispositivos.** O token de renovação vale uma única vez, e reapresentá-lo é
tratado como roubo.

O cenário acontece sozinho: três requisições recebem 401 ao mesmo tempo, cada uma
dispara uma renovação.

```ts
let emCurso: Promise<Session> | null = null;
const pendentes: (() => void)[] = [];

async function comSessaoValida<T>(chamada: () => Promise<T>): Promise<T> {
  try {
    return await chamada();
  } catch (erro) {
    if (!(erro instanceof ApiError) || erro.status !== 401) throw erro;

    // Uma renovação; as demais esperam a mesma promessa
    emCurso ??= renovar().finally(() => { emCurso = null; });
    await emCurso;

    return chamada();
  }
}
```

**Melhor ainda: renove antes de expirar.** O `expiresIn` vem no login (900
segundos). Agende a renovação em ~80% disso e o 401 nunca acontece:

```ts
setTimeout(() => void renovar(), sessao.expiresIn * 0.8 * 1000);
```

## 2. Uma `Idempotency-Key` por intenção do usuário

Gere no momento em que o usuário decide, não a cada envio. Guarde-a junto da
tentativa para reutilizar em retry — e descarte-a quando ele mudar de assento.
Reaproveitar a chave com corpo diferente responde `409` de propósito
([`04-reserva-e-pagamento.md`](04-reserva-e-pagamento.md)).

## 3. Trave o botão de reservar e o leitor de QR

São escritas. Duplo clique na reserva com a mesma chave é inofensivo (a API
reproduz a resposta), mas duplo clique **sem** chave gera 409 confuso; e leitura
dupla da câmera mostra "já utilizado" logo depois de "liberado".

Desabilite o controle durante a requisição e, no leitor, espere ~2 s antes de
aceitar a próxima leitura.

## 4. Não busque o que já veio embutido

| Já vem junto | Não chame |
| --- | --- |
| `GET /tickets/mine` traz `event` completo | `/events/:id` por ingresso |
| `GET /events/:id/seats` traz todos os assentos e a disponibilidade | Uma chamada por assento |
| `GET /reservations/mine` traz `seatLabel` | `/events/:id/seats` para descobrir o rótulo |
| Login traz `user` completo | `/auth/me` logo depois do login |

`/auth/me` serve para reidratar sessão no boot do app, não para complementar o
login.

## 5. Debounce na busca do catálogo

O backend cacheia por 10 minutos, mas cada tecla digitada ainda é uma requisição
HTTP e uma ida ao Redis. Mínimo de 2 caracteres (a API exige), debounce de
300–500 ms, e cancele a anterior:

```ts
const controller = new AbortController();
// ...
fetch(url, { signal: controller.signal });
```

Vale o mesmo para a busca de eventos.

## 6. Carregue detalhe e mapa em paralelo

A tela de compra precisa dos dois, e eles não dependem um do outro:

```ts
const [evento, mapa] = await Promise.all([
  api<EventDetail>(`/events/${id}`),
  api<SeatMap>(`/events/${id}/seats`),
]);
```

Sequencial dobra o tempo até a primeira pintura sem motivo.

## 7. Trate o mapa de assentos como dado que envelhece

Outra pessoa pode reservar entre o carregamento e o clique. Duas medidas:

- **Recarregue o mapa depois de um `409`** na reserva, sempre. O usuário precisa
  ver o assento ficar vermelho.
- **Não faça polling agressivo.** Um refetch ao focar a janela
  (`visibilitychange`) cobre o caso real sem martelar a API. Se quiser algo mais
  vivo, 15–30 segundos é suficiente para um mapa de 30 lugares.

Não existe WebSocket nesta API: a atualização é sob demanda.

## 8. Cache no cliente, com invalidação por escrita

Se usar React Query, SWR ou equivalente:

| Dado | `staleTime` sugerido | Invalida quando |
| --- | --- | --- |
| `GET /events` | 60 s | Publicar ou cancelar evento |
| `GET /events/:id` | 60 s | Editar evento |
| `GET /events/:id/seats` | **0** | Reservar, cancelar reserva, 409 |
| `GET /reservations/mine` | 0–10 s | Reservar, pagar, cancelar |
| `GET /tickets/mine` | 30 s | Pagar |
| `GET /catalog/search` | 5 min | — (o backend já cacheia 10 min) |

Mapa de assentos com cache é a receita para o usuário clicar num lugar já
vendido.

## 9. Paginação: peça o que cabe na tela

`take` vale até 50. Pedir 50 para mostrar 10 desperdiça banda e tempo de banco.
Para listagem infinita, `skip` acumulado; para paginada, `Math.ceil(total / take)`.

## 10. Peso das respostas

Nada aqui é grande, mas vale saber onde está o volume:

| Resposta | Tamanho típico |
| --- | --- |
| `GET /events?take=20` | ~8 KB |
| `GET /events/:id/seats` (30 lugares) | ~3 KB |
| `qrContent` de um ingresso | ~200 bytes |
| `GET /catalog/search` (20 itens) | ~15 KB — inclui descrições longas |

O catálogo é o mais pesado, por causa das descrições vindas das APIs externas.
Se a sua tela só mostra título e imagem, não guarde o resto em estado global.

## 11. Uma tela de erro que ajuda

Mostre a `message` da API — ela já vem em português e escrita para o usuário
final —, e o `requestId` em letra miúda. Com ele, qualquer erro vira uma linha
localizável no log do backend.

## 12. O `/health` é seu amigo no desenvolvimento

```jsonc
{ "status": "ok", "services": { "database": "up", "cache": "up" } }
```

`degraded` significa Redis fora: reservas continuam funcionando (a garantia está
no banco), mas idempotência e limite de tentativas ficam suspensos. Se algo
estranho acontecer no desenvolvimento, é o primeiro lugar a olhar — antes de
suspeitar do frontend.
