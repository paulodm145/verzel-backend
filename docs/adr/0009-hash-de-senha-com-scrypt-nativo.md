---
status: "accepted"
date: 2026-08-12
decision-makers: Paulo Roberto Bolsanello
---

# 0009. Derivar hash de senha com o scrypt do node:crypto

## Contexto e problema

As senhas dos usuários precisam ser guardadas de forma que o vazamento do banco
não entregue as credenciais. Isso exige uma função de derivação lenta e com sal
por usuário — hash rápido como SHA-256 é inadequado, porque a mesma propriedade
que o torna bom para integridade (velocidade) o torna péssimo para senha.

A seção 2 do [`CLAUDE.md`](../../CLAUDE.md) manda avaliar, antes de instalar
qualquer pacote, se o problema se resolve com o que já está no stack.

## Forças da decisão

* Resistir a ataque de dicionário com hardware dedicado, não só a força bruta
  ingênua.
* Ser instalável por quem for avaliar o projeto, sem passo de compilação.
* Não multiplicar dependências para algo que o runtime já oferece.
* Não inventar criptografia: o algoritmo precisa ser padrão e auditado.

## Opções consideradas

* `scrypt` do módulo `node:crypto`
* `argon2` (pacote com addon nativo)
* `bcrypt` (pacote com addon nativo)

## Decisão

Escolhido o **`scrypt` do `node:crypto`**. Ele é memória-dura — o custo de
quebrar cresce em RAM, não só em CPU, que é o que encarece o ataque com GPU — e
consta na lista de funções aceitáveis do OWASP. Vem no runtime: zero
dependências, zero compilação, nada a instalar para o avaliador.

Parâmetros: `N = 2^15`, `r = 8`, `p = 3`, saída de 64 bytes, sal aleatório de 16
bytes por usuário. É uma das combinações que o OWASP lista como equivalentes ao
mínimo recomendado. Medido neste projeto: 291 ms por derivação, contra 510 ms de
`N = 2^16` e 1134 ms de `N = 2^17`, todos com a mesma segurança nominal.

O formato armazenado é `scrypt$N$r$p$<sal em base64url>$<hash em base64url>`. Os
parâmetros viajam junto com o hash de propósito: endurecer o custo mais tarde não
pode invalidar as senhas já cadastradas, e a verificação precisa saber com que
custo aquele hash foi gerado.

A comparação usa `timingSafeEqual`. Comparar com `===` vazaria, pelo tempo, quão
perto o palpite chegou.

### Consequências

* Boa, porque instalar o projeto continua sendo `npm ci`, sem toolchain de
  compilação — o desafio será avaliado numa máquina que não é a nossa.
* Boa, porque o mesmo `node:crypto` assina o QR Code do Épico 5: uma única
  primitiva criptográfica para o leitor entender, não duas.
* Ruim, porque o formato de armazenamento é nosso, não um padrão como o `$2b$` do
  bcrypt — ferramenta externa não sabe lê-lo.
* Ruim, porque a responsabilidade de gerar sal, escolher parâmetros e comparar em
  tempo constante fica no nosso código, onde bibliotecas prontas já resolveriam.
  Mitigado por teste dedicado a cada uma dessas três propriedades.
* Neutra, porque `N = 2^15` exige elevar o `maxmem` do Node explicitamente: os
  32 MiB necessários batem exatamente no limite padrão, e sem isso a chamada
  falha.

### Confirmação

Testes unitários provam que a mesma senha gera hashes diferentes (sal por
usuário), que a senha correta verifica, que a errada não, e que um hash com
parâmetros diferentes dos atuais ainda verifica — que é o que garante a migração
de custo sem invalidar conta antiga.

## Prós e contras das opções

### scrypt do node:crypto

* Boa, porque é memória-dura e aceita pelo OWASP.
* Boa, porque não acrescenta dependência nem compilação.
* Ruim, porque o encapsulamento (formato, sal, comparação) é código nosso.

### argon2

* Boa, porque é o primeiro da lista do OWASP e o vencedor da Password Hashing
  Competition.
* Boa, porque a biblioteca já define formato de armazenamento padronizado.
* Ruim, porque é addon nativo: exige compilar na instalação, e falha de build na
  máquina do avaliador vira falha do projeto.

### bcrypt

* Boa, porque é o mais reconhecível por quem lê o código.
* Ruim, porque só é CPU-duro, não memória-duro.
* Ruim, porque trunca a senha em 72 bytes, o que surpreende quem não sabe.
* Ruim, porque também é addon nativo.

## Mais informações

* [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
* [Node.js — `crypto.scrypt`](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
* [ADR 0004](0004-qrcode-com-assinatura-hmac.md) — a outra decisão que se apoia em
  `node:crypto`.
