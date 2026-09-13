[README (1).md](https://github.com/user-attachments/files/32166319/README.1.md)
[README.md](https://github.com/user-attachments/files/32165433/README.md)
# VendaBot — Bot WhatsApp

Bot Baileys que lê `products`, `groups` e `schedules` direto do Supabase
(mesmo banco usado pelo painel Lovable) e dispara ofertas automáticas
nos grupos do WhatsApp, com copy gerada pelo `agente.js`.

## Arquitetura: dois serviços, um código só

Esse mesmo `bot.js` roda em **dois serviços separados no Render** — um
atende só conexão por QR Code, o outro só por pareamento via número —
pra evitar que os dois brigem pelo mesmo usuário. Cada serviço descobre
seu papel pela variável de ambiente `MODO_CONEXAO`, que é obrigatória:

- `MODO_CONEXAO=qr` → só escuta/reconecta usuários com `connection_method = qr`
- `MODO_CONEXAO=pairing` → só escuta/reconecta usuários com `connection_method = pairing`

Sem essa variável configurada certinha (só aceita `qr` ou `pairing`), o
processo recusa subir de propósito.

## Rodar localmente

```bash
npm install
cp env.example .env
# edite o .env: cole a SUPABASE_SERVICE_KEY (chave service_role, pegue em
# Supabase → Project Settings → API), o INTERNAL_TRIGGER_SECRET, e escolha
# MODO_CONEXAO=qr ou MODO_CONEXAO=pairing
npm start
```

Se `MODO_CONEXAO=qr`, vai aparecer um QR Code no terminal — escaneie com
o WhatsApp (Aparelhos conectados → Conectar um aparelho). Se
`MODO_CONEXAO=pairing`, o código de pareamento é gerado quando um usuário
pede conexão pelo painel (não aparece sozinho no terminal).

## Deploy no Render (dois serviços)

Repita esses passos **duas vezes** — uma pra cada modo — apontando pro
mesmo repositório GitHub:

1. No Render: New → Web Service → conecte este repositório
2. Configurações:
   - Build Command: `npm install`
   - Start Command: `node bot.js`
3. Em Environment, adicione:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `INTERNAL_TRIGGER_SECRET`
   - `MODO_CONEXAO` → `qr` num serviço, `pairing` no outro
4. Dê nomes que deixem claro qual é qual (ex: `vendabot-bot-qr` e
   `vendabot-bot-pairing`), pra não confundir depois no dashboard do Render
5. Acompanhe os **Logs** de cada serviço — a primeira linha mostra
   `(modo: QR)` ou `(modo: PAIRING)`, confirmando que pegou a variável certa
