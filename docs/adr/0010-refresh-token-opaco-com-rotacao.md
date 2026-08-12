---
status: "accepted"
date: 2026-08-12
decision-makers: Paulo Roberto Bolsanello
---

# 0010. Token de renovação opaco, com rotação e detecção de reuso

## Contexto e problema

O token de acesso é curto de propósito: ele não é consultado no banco, então
revogá-lo é impossível — a única coisa que o encerra é o relógio. Isso resolve
desempenho e cria um problema: alguém precisa poder encerrar uma sessão.

A [spec 0002](../specs/0002-autenticacao/spec.md) exige que logout invalide a
sessão de fato e que sessão comprometida possa ser interrompida. Isso obriga a
escolher onde vive o estado da sessão — e um JWT de vida longa, por definição,
não tem lugar onde esse estado caiba.

## Forças da decisão

* Logout precisa invalidar de verdade, não apenas apagar o token no cliente.
* Vazamento do banco não pode entregar sessões ativas.
* O sistema precisa continuar correto com o Redis fora do ar
  ([ADR 0003](0003-lock-redis-com-constraint-no-banco.md)).
* Roubo de token de renovação deve ser ao menos detectável.

## Opções consideradas

* Token opaco armazenado no Postgres, trocado a cada uso
* JWT de vida longa, sem armazenamento
* Token opaco armazenado no Redis

## Decisão

Escolhido o **token opaco no Postgres, com rotação**. São 32 bytes aleatórios em
base64url, e o banco guarda apenas o **SHA-256** do token, nunca ele próprio.

SHA-256 basta aqui, e é a diferença que separa este ADR do
[0009](0009-hash-de-senha-com-scrypt-nativo.md): senha é escolhida por gente, tem
pouca entropia e por isso precisa de KDF lenta; um token de 256 bits aleatórios
não é atacável por dicionário, e gastar 300 ms de scrypt a cada renovação seria
custo sem retorno.

Cada renovação acontece numa transação que revoga o token apresentado e emite
outro. Um token de renovação vale uma vez só. Reapresentar um token já revogado
não é acidente comum: ou é replay, ou o token foi roubado e o legítimo já
rotacionou. Nos dois casos a resposta é a mesma — revogar **todas** as sessões
daquele usuário e responder 401. Quem perdeu o token perde a sessão; quem roubou,
também.

A tabela é `RefreshToken (id, userId, tokenHash único, expiresAt, revokedAt,
createdAt)`, com índice em `userId` para a revogação em massa e em `expiresAt`
para a limpeza dos vencidos.

### Consequências

* Boa, porque logout, revogação e detecção de reuso passam a existir de verdade,
  e são demonstráveis por teste.
* Boa, porque o banco vazado não entrega sessões: os hashes não são reversíveis.
* Boa, porque a sessão sobrevive à queda do Redis, coerente com o ADR 0003.
* Ruim, porque a renovação passa a custar uma transação no banco, ao contrário do
  JWT stateless que não custa nada — aceitável, porque acontece a cada quinze
  minutos por usuário, não a cada requisição.
* Ruim, porque tokens expirados se acumulam na tabela até alguém apagá-los. A
  limpeza é assunto do Épico 7; o índice em `expiresAt` já está lá para ela.
* Ruim, porque a detecção de reuso derruba sessões legítimas quando um cliente
  repete uma requisição de renovação por falha de rede. É o preço de tratar
  reuso como hostil, e o mais conservador dos dois erros possíveis.

### Confirmação

Testes de integração provam a rotação (o token anterior deixa de valer), a
detecção de reuso (o token reapresentado derruba as demais sessões do usuário) e
o logout (a sessão encerrada não renova). Um teste verifica que o valor
armazenado difere do token entregue ao cliente.

## Prós e contras das opções

### Token opaco no Postgres, com rotação

* Boa, porque permite revogação, rotação e detecção de reuso.
* Boa, porque não depende do Redis para manter sessão.
* Ruim, porque acrescenta tabela, migration e uma consulta por renovação.

### JWT de vida longa, sem armazenamento

* Boa, porque não exige tabela nem consulta: é o caminho mais barato.
* Ruim, porque logout vira encenação — o token continua válido até expirar.
* Ruim, porque token vazado não tem como ser interrompido.

### Token opaco no Redis

* Boa, porque a expiração é nativa e não deixa lixo acumulado.
* Ruim, porque amarra a sessão a um serviço que o ADR 0003 define como auxiliar:
  Redis fora do ar significaria todos os usuários deslogados.

## Mais informações

* [OWASP Cheat Sheet — Refresh Token Rotation](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
* [RFC 6749 §10.4](https://datatracker.ietf.org/doc/html/rfc6749#section-10.4) —
  recomendações sobre refresh token no OAuth 2.0.
* Seção 8 do [`CLAUDE.md`](../../CLAUDE.md).
