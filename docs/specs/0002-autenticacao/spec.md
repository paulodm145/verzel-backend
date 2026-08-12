# Spec 0002 — Autenticação

| | |
| --- | --- |
| **Épico** | 2 — Autenticação |
| **Branch** | `feat/0002-autenticacao` |
| **Status** | approved |

## Problema

O sistema tem três papéis com poderes muito diferentes — organizador publica
eventos, cliente compra ingressos, portaria valida quem entra — e hoje não sabe
quem é quem. Sem identidade, qualquer requisição pode fazer qualquer coisa: um
visitante marcaria ingressos alheios como usados, ou publicaria eventos em nome
de outro organizador.

Todos os épicos seguintes dependem disto. Reserva precisa saber de quem é a
reserva, evento precisa saber quem é o dono, portaria precisa ser um lugar onde
só a portaria entra. Enquanto não houver identidade verificável em cada
requisição, nenhuma regra de autorização pode ser escrita — e escrevê-las depois
significaria voltar a mexer em todo endpoint já entregue.

Quem usa o sistema precisa entrar uma vez e continuar dentro sem reautenticar a
cada minuto, e precisa poder sair de verdade: sessão encerrada tem de deixar de
valer. Um token vazado que continue funcionando até expirar, sem que ninguém
possa interrompê-lo, é uma sessão que nunca termina.

## Escopo

### Entra

* Cadastro público de cliente, com senha guardada apenas como hash.
* Login por e-mail e senha, devolvendo um par de tokens.
* Renovação da sessão a partir do token de renovação, com troca do token a cada
  uso.
* Encerramento de sessão que invalida o token de renovação apresentado.
* Consulta do próprio perfil.
* Identificação do solicitante em cada requisição e restrição de rotas por papel,
  reutilizável por todos os épicos seguintes.
* Dados semeados: um organizador, dois clientes e um usuário de portaria, com
  credenciais documentadas no README.

### Não entra

* Recuperação e troca de senha — fora do escopo do desafio, conforme a seção 8 do
  [`CLAUDE.md`](../../../CLAUDE.md).
* Cadastro de organizador e de portaria pela API. Esses papéis nascem do seed
  (RN-2).
* Autorização específica de cada recurso — que o evento só possa ser editado pelo
  organizador dono, por exemplo. O mecanismo de papel entra aqui; a regra de cada
  recurso pertence à spec do seu épico.
* Verificação de e-mail, autenticação de dois fatores e login por terceiros.

## Regras de negócio

1. **RN-1** — Senha nunca é armazenada nem registrada em log; o banco guarda
   apenas um hash derivado por função memória-dura, com sal próprio por usuário.
2. **RN-2** — O cadastro público cria exclusivamente usuários `CUSTOMER`. Papel
   informado pelo cliente é ignorado, não recusado. `ORGANIZER` e `GATE` só
   existem por seed.
3. **RN-3** — A resposta de falha no login é idêntica para e-mail inexistente e
   senha errada, inclusive no tempo de resposta: quem tenta adivinhar não
   descobre quais contas existem.
4. **RN-4** — O token de acesso é verificável sem consulta ao banco. O papel
   viaja como claim assinada.
5. **RN-5** — O token de renovação é opaco, de alta entropia, e o banco guarda
   somente o seu hash. Nem quem lê o banco consegue usar a sessão de alguém.
6. **RN-6** — Cada renovação invalida o token usado e emite outro. Um token de
   renovação vale uma única vez.
7. **RN-7** — Reapresentar um token de renovação já invalidado é tratado como
   indício de roubo: todas as sessões daquele usuário são encerradas.
8. **RN-8** — Rota protegida sem identidade válida responde 401; identidade
   válida com papel insuficiente responde 403. Os dois casos são distintos e não
   se confundem.
9. **RN-9** — Nenhum segredo de assinatura fica no código. A aplicação recusa
   iniciar sem ele, conforme a RN-6 da [spec 0001](../0001-fundacao/spec.md).

## Critérios de aceite

* **CA-1** — Dado um e-mail ainda não cadastrado, quando se envia cadastro com
  senha válida, então a conta é criada com papel `CUSTOMER` e a resposta traz o
  usuário e um par de tokens, sem nenhuma forma da senha.
* **CA-2** — Dado um cadastro cujo corpo informa `role: "GATE"`, quando ele é
  processado, então o usuário criado tem papel `CUSTOMER`.
* **CA-3** — Dado um e-mail já cadastrado, quando se tenta cadastrar de novo,
  então a resposta é 409 e nenhuma segunda conta é criada.
* **CA-4** — Dada uma senha armazenada, quando se inspeciona o registro do
  usuário, então o valor guardado difere da senha, e duas contas com a mesma
  senha têm hashes diferentes.
* **CA-5** — Dadas credenciais corretas, quando se faz login, então a resposta
  traz um token de acesso e um de renovação.
* **CA-6** — Dado um e-mail inexistente e dada uma senha errada de conta
  existente, quando se tenta logar em ambos os casos, então as duas respostas têm
  o mesmo status, o mesmo código e a mesma mensagem.
* **CA-7** — Dado um token de acesso válido, quando se consulta o próprio perfil,
  então a resposta traz o usuário correspondente ao token.
* **CA-8** — Dada uma requisição sem token, ou com token expirado, adulterado ou
  assinado com outra chave, a uma rota protegida, então a resposta é 401.
* **CA-9** — Dado um usuário `CUSTOMER` autenticado, quando ele acessa uma rota
  restrita a `GATE`, então a resposta é 403.
* **CA-10** — Dado um token de renovação válido, quando se pede renovação, então
  a resposta traz um par novo e o token anterior deixa de ser aceito.
* **CA-11** — Dado um token de renovação já usado uma vez, quando ele é
  apresentado de novo, então a resposta é 401 e as demais sessões daquele usuário
  também deixam de valer.
* **CA-12** — Dada uma sessão ativa, quando se faz logout, então o token de
  renovação daquela sessão deixa de ser aceito.
* **CA-13** — Dado um token de renovação expirado, quando se pede renovação,
  então a resposta é 401.
* **CA-14** — Dado o banco recém-semeado, quando se consulta os usuários criados,
  então existem um `ORGANIZER`, dois `CUSTOMER` e um `GATE`, e rodar o seed de
  novo não os duplica.
* **CA-15** — Dadas as credenciais publicadas no README, quando se faz login com
  cada uma delas, então todas autenticam.

## Casos de erro

| Situação | Resposta esperada |
| --- | --- |
| Corpo de cadastro ou login violando o schema | `400` `VALIDATION_ERROR` |
| E-mail já cadastrado | `409` `CONFLICT` |
| E-mail inexistente ou senha errada | `401` `UNAUTHORIZED`, mensagem genérica |
| Requisição sem cabeçalho `Authorization` | `401` `UNAUTHORIZED` |
| Token de acesso expirado, adulterado ou de outra chave | `401` `UNAUTHORIZED` |
| Papel insuficiente para a rota | `403` `FORBIDDEN` |
| Token de renovação desconhecido, expirado ou já usado | `401` `UNAUTHORIZED` |

## Perguntas em aberto

Nenhuma. As quatro decisões que estavam abertas foram tomadas antes desta spec:
hash de senha, biblioteca de JWT, modelo do token de renovação e política de
cadastro. As duas de arquitetura viram ADR; as outras ficam registradas no
[plan](plan.md).

## Referências

* Seções 8 e 13 do [`CLAUDE.md`](../../../CLAUDE.md) — papéis, `requireRole` e
  dados semeados.
* [Spec 0001](../0001-fundacao/spec.md) — formato de erro, validação nas bordas e
  validação do ambiente na partida, reaproveitados aqui.
* [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
  — parâmetros aceitáveis de scrypt.
* [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
  — verificação de algoritmo e expiração.
