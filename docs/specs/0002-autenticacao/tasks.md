# Tasks 0002 — Autenticação

Quebra do [plan 0002](plan.md) em commits atômicos. Uma tarefa está pronta quando
o código existe, os testes dela passam e o build não quebra.

## Tarefas

### Bloco 1 — Primitivas

- [x] **T-1** — `password.service.ts`: derivar e verificar hash com scrypt,
      `N = 2^15`, `r = 8`, `p = 3`, sal de 16 bytes, `maxmem` de 64 MiB, formato
      `scrypt$N$r$p$sal$hash` e comparação com `timingSafeEqual`.
  - Commit: `feat(auth): derivar hash de senha com scrypt`
  - Cobre: CA-4, RN-1
  - Testes: unitário — a mesma senha gera hashes diferentes; a senha certa
    verifica e a errada não; hash com parâmetros antigos ainda verifica; entrada
    malformada não derruba a verificação

- [x] **T-2** — Variáveis novas no `env.ts` e no `.env.example`: `JWT_SECRET`
      (mínimo de 32 caracteres), `ACCESS_TOKEN_TTL` e `REFRESH_TOKEN_TTL`, ambos
      com padrão.
  - Commit: `feat(config): validar o segredo e os prazos de token`
  - Cobre: RN-9
  - Testes: unitário — segredo curto é recusado nomeando a variável

- [x] **T-3** — Instalar `jose` (`^6.2.8`, única dependência nova do épico) e
      escrever `token.service.ts`: emitir e verificar o token de acesso com
      `jose` (HS256, `algorithms` explícito), gerar o token de renovação com 32
      bytes aleatórios e derivar seu SHA-256.
  - Commit: `feat(auth): emitir e verificar os tokens de sessão`
  - Cobre: CA-8, RN-4, RN-5
  - Testes: unitário — token emitido verifica e devolve `sub` e `role`; expirado
    é recusado; assinado com outra chave é recusado; `alg` trocado é recusado;
    dois tokens de renovação nunca colidem e o hash difere do token

### Bloco 2 — Persistência

- [x] **T-4** — Modelo `RefreshToken` no schema Prisma e migration aditiva.
  - Commit: `feat(prisma): modelar o token de renovação`
  - Cobre: RN-5, RN-6
  - Testes: integração — `tokenHash` duplicado é rejeitado; apagar o usuário
    apaga suas sessões

- [x] **T-5** — `auth.schema.ts` com os schemas de entrada e saída do plan.
  - Commit: `feat(auth): definir os schemas de entrada e saída`
  - Cobre: parte do CA-2
  - Testes: unitário — `role` no corpo do cadastro é descartado pelo parse; senha
    curta e e-mail inválido são recusados

- [x] **T-6** — `auth.repository.ts`: interface `AuthRepository` e implementação
      Prisma (buscar usuário por e-mail e por id, criar usuário, criar e buscar
      token de renovação, revogar um e revogar todos de um usuário).
  - Commit: `feat(auth): isolar o acesso a dados atrás de um repositório`
  - Cobre: —
  - Testes: integração — cada operação contra o banco de teste

### Bloco 3 — Regra de sessão

- [x] **T-7** — `auth.service.ts`, cadastro e login: papel fixo em `CUSTOMER`,
      e-mail duplicado vira `ConflictError`, credencial errada vira
      `UnauthorizedError` com verificação contra hash de mentira quando o e-mail
      não existe.
  - Commit: `feat(auth): cadastrar e autenticar usuário`
  - Cobre: CA-2, CA-3, CA-6, RN-2, RN-3
  - Testes: unitário com repositório falso — duplicado, senha errada, e-mail
    inexistente percorrendo a verificação de mentira

- [x] **T-8** — `auth.service.ts`, rotação e revogação: renovar troca o token em
      transação; token revogado reapresentado derruba todas as sessões do
      usuário; logout revoga o apresentado.
  - Commit: `feat(auth): rotacionar a sessão e detectar reuso de token`
  - Cobre: CA-10, CA-11, CA-12, CA-13, RN-6, RN-7
  - Testes: unitário com repositório falso — rotação, reuso, expirado e
    desconhecido

### Bloco 4 — Borda HTTP

- [x] **T-9** — `authenticate.ts` e `require-role.ts`, com o contexto no
      `WeakMap` e `getAuth`.
  - Commit: `feat(shared): identificar o solicitante e restringir por papel`
  - Cobre: CA-8, CA-9, RN-8
  - Testes: integração — sem cabeçalho, com token adulterado, com token de outra
    chave e com token expirado dão 401; papel insuficiente dá 403

- [x] **T-10** — `auth.controller.ts`, `auth.routes.ts` e montagem no `app.ts`.
  - Commit: `feat(auth): expor as rotas de sessão`
  - Cobre: CA-1, CA-5, CA-7
  - Testes: integração — fluxo `register → login → me → refresh → logout`

- [x] **T-11** — Documentar as rotas no OpenAPI, com o esquema de segurança
      Bearer e exemplos para os três papéis.
  - Commit: `feat(docs): documentar as rotas de autenticação`
  - Cobre: —
  - Testes: integração — `/docs.json` traz as cinco rotas e o `securityScheme`

### Bloco 5 — Dados e documentação

- [x] **T-12** — `prisma/seed.ts` idempotente com um organizador, dois clientes e
      uma portaria, registrado no `prisma.config.ts` e no script `db:seed`.
  - Commit: `feat(prisma): semear usuários de teste dos três papéis`
  - Cobre: CA-14, CA-15
  - Testes: integração — os quatro usuários existem com os papéis certos; rodar
    duas vezes não duplica; cada credencial do README autentica

- [x] **T-13** — README: variáveis novas, credenciais de teste, como rodar o seed
      e a explicação da sessão (rotação e detecção de reuso).
  - Commit: `docs: documentar a autenticação e as credenciais de teste`
  - Cobre: CA-15
  - Testes: seguir o próprio README

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-10 |
| CA-2 | T-5, T-7 |
| CA-3 | T-7 |
| CA-4 | T-1 |
| CA-5 | T-10 |
| CA-6 | T-7 |
| CA-7 | T-10 |
| CA-8 | T-3, T-9 |
| CA-9 | T-9 |
| CA-10 | T-8 |
| CA-11 | T-8 |
| CA-12 | T-8 |
| CA-13 | T-8 |
| CA-14 | T-12 |
| CA-15 | T-12, T-13 |

Os quinze critérios têm tarefa.

## Definição de pronto do épico

- [x] Os quinze critérios cobertos por teste automatizado
- [x] `npm run lint` e `npm run typecheck` sem erro
- [x] `npm test` verde
- [x] As cinco rotas visíveis em `/docs`, com o esquema Bearer
- [x] Credenciais de teste no README, e todas autenticam
- [x] Checkbox do Épico 2 marcado no backlog do `CLAUDE.md`
- [x] Status da spec 0002 atualizado no roadmap, junto com o da 0001, que ficou
      em "em revisão" após o merge do Épico 1
- [x] Nenhum segredo commitado
