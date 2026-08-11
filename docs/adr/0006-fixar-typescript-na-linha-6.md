---
status: "accepted"
date: 2026-08-11
decision-makers: Paulo Roberto Bolsanello
---

# 0006. Fixar TypeScript na linha 6.x, apesar de a 7 ser a versão corrente

## Contexto e problema

O `CLAUDE.md` exige TypeScript em modo estrito e ESLint. A versão `latest` no npm
é a 7.0.2 — o compilador reescrito em Go, entre 8 e 12 vezes mais rápido. O
reflexo natural ao iniciar um projeto novo é pegar a versão corrente. Neste caso
isso quebraria o lint.

## Forças da decisão

* O `CLAUDE.md` exige ESLint, e lint com regras que dependem de tipo é o que de
  fato pega erro em projeto TypeScript.
* Velocidade de compilação é irrelevante num projeto deste tamanho.
* Um compilador que não conversa com o linter inviabiliza o portão de qualidade
  antes de ele existir.

## Opções consideradas

* TypeScript 6.0.3, a última estável da linha anterior
* TypeScript 7.0.2, a versão corrente
* TypeScript 7.0.2 com lint sem regras que dependem de tipo

## Decisão

Escolhida a opção "TypeScript 6.0.3", porque a 7 é incompatível com o
`typescript-eslint`, e isso não é uma suposição: o `peerDependencies` do pacote
declara `typescript: ">=4.8.4 <6.1.0"`.

A causa é conhecida e temporária — a 7.0 saiu sem API programática estável, o que
impede as ferramentas que dependem dela (`typescript-eslint`, e o ferramental de
Vue, Svelte, Astro e Angular) de suportá-la. A API está prevista para a 7.1.

```jsonc
// package.json
"devDependencies": {
  "typescript": "~6.0.3"
}
```

### Consequências

* Boa, porque o lint com regras que dependem de tipo funciona desde o primeiro
  commit, em vez de ser adiado.
* Boa, porque `~6.0.3` aceita correções de patch sem abrir para a 6.1, onde a
  compatibilidade declarada termina.
* Ruim, porque o projeto nasce uma linha principal atrás e abre mão do ganho de
  velocidade da 7 — irrelevante aqui, mas é uma dívida com data para ser paga.
* Ruim, porque a decisão depende de uma janela de incompatibilidade que vai
  fechar, e um ADR que descreve estado temporário envelhece rápido: se ninguém
  revisitar, o projeto fica preso a uma versão antiga por inércia.

### Confirmação

`npm run lint` precisa executar com regras que dependem de tipo ativas
(`projectService`), sem aviso de versão não suportada de TypeScript.

Esta decisão é revisitada quando o `typescript-eslint` publicar suporte à linha
7 — o gatilho é o `peerDependencies` do pacote passar a aceitar `<8`.

## Prós e contras das opções

### TypeScript 6.0.3

* Boa, porque é a versão mais nova que todo o ferramental suporta hoje.
* Neutra, porque compila mais devagar, sem impacto prático nesta escala.
* Ruim, porque exige atualização deliberada mais adiante.

### TypeScript 7.0.2

* Boa, porque é a versão corrente e muito mais rápida.
* Ruim, porque `npm install` falharia no conflito de peer dependency, ou o lint
  passaria a rodar com uma versão que a ferramenta declara não suportar.

### TypeScript 7.0.2 com lint sem regras de tipo

* Boa, porque permitiria usar o compilador novo.
* Ruim, porque descarta justamente as regras que justificam ter linter em
  TypeScript — sobraria verificação de estilo, que o `.editorconfig` já cobre.

## Mais informações

* `npm view typescript-eslint@8.67.0 peerDependencies` →
  `typescript: ">=4.8.4 <6.1.0"`
* [TypeScript 7.0 — anúncio de lançamento](https://www.infoq.com/news/2026/08/typescript-7-released/):
  a 7.0 saiu sem API programática estável, prevista para a 7.1.
