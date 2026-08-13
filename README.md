# VendaBot — Bot WhatsApp

Bot Baileys que lê `products`, `groups` e `schedules` direto do Supabase
(mesmo banco usado pelo painel Lovable) e dispara ofertas automáticas
nos grupos do WhatsApp, com copy gerada pelo `agente.js`.

## Rodar localmente

```bash
npm install
cp .env.example .env
# edite o .env e cole a SUPABASE_SERVICE_KEY (chave service_role, pegue em
# Supabase → Project Settings → API)
npm start
```

Vai aparecer um QR Code no terminal — escaneie com o WhatsApp
(Aparelhos conectados → Conectar um aparelho).

## Deploy no Render

1. Suba este código pra um repositório GitHub **separado** do painel Lovable
2. No Render: New → Web Service → conecte esse repositório
3. Configurações:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Em Environment, adicione:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
5. Depois do primeiro deploy, veja o QR Code nos **Logs** do Render e escaneie
