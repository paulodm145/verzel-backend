# 5. Ingressos e portaria

## `GET /tickets/mine` — cliente

```jsonc
// 200
{
  "items": [
    {
      "id": "uuid",
      "code": "TKT-4F2K-9QX7-M3PD",
      "status": "VALID",                 // VALID | USED
      "qrContent": "eyJ0aWNrZXRJZCI6…​.assinatura",
      "seatLabel": "A1",
      "usedAt": null,                    // preenchido depois da entrada
      "event": {
        "id": "uuid",
        "title": "Clube da Luta — Sessão Especial",
        "date": "2026-12-20T21:00:00.000Z",
        "venue": "Cine Arena"
      },
      "shareUrl": "http://localhost:3000/tickets/TKT-4F2K-9QX7-M3PD"
    }
  ],
  "total": 1, "skip": 0, "take": 20
}
```

O evento vem embutido — **não** faça uma chamada a `/events/:id` por ingresso.

## Desenhando o QR Code

`qrContent` é uma **string assinada**, não uma imagem. O backend não devolve PNG
de propósito: gerar imagem no servidor somaria dependência para algo que o
navegador faz melhor, e a string é o que a portaria lê.

```tsx
import { QRCodeSVG } from "qrcode.react";

<QRCodeSVG
  value={ticket.qrContent}
  size={280}
  level="M"        // "L" deixa o código menos denso: 53×53 em vez de 61×61
  marginSize={4}   // zona silenciosa; sem ela, muitos leitores falham
/>;
```

### Dimensionamento — medido, não estimado

O `qrContent` tem **215 caracteres** em base64url. Como base64url usa minúsculas
e `-`/`_`, o codificador escolhe o **modo byte** (8 bits por caractere), e não o
alfanumérico — por isso o código sai mais denso que o de uma URL curta.

Geração e leitura de volta, conferidas com um decodificador real:

| Correção | Versão | Módulos | Tamanho renderizado | Leitura |
| --- | --- | --- | --- | --- |
| `L` | 9 | 53×53 | 244×244 px | idêntico |
| `M` | 11 | 61×61 | 276×276 px | idêntico |
| `M` | 11 | 61×61 | 207×207 px | idêntico |
| `M` | 11 | 61×61 | 138×138 px | idêntico |
| `H` | 15 | 77×77 | 340×340 px | idêntico |

Cabe com folga: o limite da versão 11 com correção `M` passa de 300 bytes.

**Renderize com 256 a 320 px.** Os 138 px da tabela decodificaram, mas ali os
pixels eram perfeitos — na entrada do evento a câmera fotografa uma tela com
brilho, reflexo e tremor, e essa margem some rápido.

### O que estraga a leitura, e não tem a ver com o backend

- **Falta de zona silenciosa.** A borda branca de 4 módulos faz parte do padrão.
  Encostar o QR na borda de um card é a causa mais comum de "não lê".
- **Fundo colorido ou gradiente.** Preto sobre branco. Card escuro? Ponha o QR
  dentro de um retângulo branco.
- **Logo no meio.** Cobre módulos e só sobrevive com correção `H`. Não compensa.

Use **SVG** em vez de canvas: escala melhor na tela do celular, que é onde o
ingresso será mostrado.

**Mostre também o `code` em texto**, grande e legível. Câmera falha, e a portaria
digita o código — foi para isso que ele foi desenhado sem `0/O` nem `1/I`.

## `GET /tickets/:code` — pública

É o **link de compartilhamento**. Devolve o mesmo objeto **sem** `shareUrl` e sem
nenhum dado do comprador.

```ts
// Compartilhar no celular
await navigator.share({
  title: `Ingresso — ${ticket.event.title}`,
  url: ticket.shareUrl,
});
```

Quem tem o link tem o ingresso: o código é aleatório e não adivinhável, e essa é
a semântica pedida. Deixe isso claro na interface antes de o usuário compartilhar.

`404` para código inexistente.

## Portaria — apenas papel `GATE`

### `POST /gate/validate`

```jsonc
// requisição — mande `qrContent` OU `code`, mais o evento da porta
{ "qrContent": "eyJ0…​.assinatura", "eventId": "uuid" }
{ "code": "TKT-4F2K-9QX7-M3PD", "eventId": "uuid" }

// 200 — sempre 200, mesmo para ingresso inválido
{
  "result": "VALID",
  "message": "Entrada liberada — assento A1",
  "ticket": { "code": "TKT-…", "seatLabel": "A1", "eventTitle": "Clube da Luta" },
  "usedAt": null
}
```

**Sempre responde 200.** A portaria precisa de um resultado para mostrar na tela,
não de um erro HTTP para tratar. Só erro de uso da API (corpo inválido, papel
errado) sai como 4xx.

### Os quatro resultados

| `result` | Significa | Cor sugerida |
| --- | --- | --- |
| `VALID` | Entrada liberada, ingresso marcado como usado | Verde |
| `ALREADY_USED` | Já entrou. `usedAt` diz quando | Amarelo |
| `WRONG_EVENT` | Ingresso legítimo, evento errado. `message` diz qual | Azul |
| `INVALID` | Assinatura não confere, código inexistente, ou evento cancelado | Vermelho |

A distinção entre `ALREADY_USED` e `INVALID` resolve a discussão na porta: "eu
não entrei ainda" é respondido com o horário exato da entrada anterior.

`WRONG_EVENT` merece tratamento próprio — a pessoa não é fraudadora, só errou de
fila. A `message` já vem em português e pronta para a tela.

### `GET /gate/tickets/:code?eventId=` — consulta sem marcar uso

Mesmas regras e o mesmo formato de resposta, **sem** consumir o ingresso. Use
para conferência antes de liberar a fila. Passe o `eventId` — sem ele, não há
como apontar `WRONG_EVENT`.

`404` para código inexistente (aqui sim, porque é uma consulta, não uma
validação).

### Leitor de QR na web

```tsx
// A validação é uma escrita: proteja contra leitura dupla da câmera
const [validando, setValidando] = useState(false);

async function aoLerQr(qrContent: string) {
  if (validando) return;
  setValidando(true);

  try {
    const resultado = await api<ValidationResult>("/gate/validate", {
      method: "POST",
      body: JSON.stringify({ qrContent, eventId }),
      token,
    });
    mostrarResultado(resultado);
  } finally {
    // Pausa antes de aceitar a próxima leitura, senão a câmera relê o mesmo
    // código e o operador vê "já utilizado" no ingresso que acabou de liberar
    setTimeout(() => setValidando(false), 2000);
  }
}
```

O backend está protegido — dois leitores simultâneos produzem exatamente uma
entrada —, mas o segundo recebe `ALREADY_USED`, e o operador na porta veria uma
tela amarela logo depois da verde. A trava no cliente evita a confusão.
