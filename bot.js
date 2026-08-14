// ╔══════════════════════════════════════════════════════╗
// ║   BOT VENDABOT — Multi-tenant (várias conexões)      ║
// ╚══════════════════════════════════════════════════════╝
// npm install @whiskeysockets/baileys qrcode-terminal qrcode node-schedule pino @supabase/supabase-js dotenv

require('dotenv').config();
const { default: makeWASocket, DisconnectReason, initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const schedule = require('node-schedule');
const { createClient } = require('@supabase/supabase-js');
const agente = require('./agente');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_KEY no .env / variáveis de ambiente.');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── ESTADO EM MEMÓRIA (por processo) ────────────────────────────────────────
const sockets = new Map();       // user_id -> socket Baileys ativo
const jobsPorUsuario = new Map(); // user_id -> array de jobs agendados

// ─── SERVIDOR HTTP MÍNIMO (satisfaz o Health Check do Render) ───────────────
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`VendaBot multi-tenant — ${sockets.size} usuário(s) conectado(s)`);
}).listen(PORT, () => console.log(`🌐 Servidor HTTP ouvindo na porta ${PORT}`));

// ─── SESSÃO DO WHATSAPP GUARDADA NO SUPABASE (agora por usuário) ────────────
async function useSupabaseAuthState(userId) {
  const writeData = async (key, data) => {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await supabase.from('bot_auth_state').upsert({
      user_id: userId,
      key,
      data: value,
      updated_at: new Date().toISOString()
    });
  };

  const readData = async (key) => {
    const { data, error } = await supabase
      .from('bot_auth_state')
      .select('data')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    try {
      return JSON.parse(data.data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (key) => {
    await supabase.from('bot_auth_state').delete().eq('user_id', userId).eq('key', key);
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData('creds', creds)
  };
}

// ─── LER CONFIG DE UM USUÁRIO ESPECÍFICO ────────────────────────────────────
async function lerConfigUsuario(userId) {
  const [{ data: productsRaw, error: e1 }, { data: groupsRaw, error: e2 }, { data: schedulesRaw, error: e3 }] =
    await Promise.all([
      supabase.from('products').select('*').eq('user_id', userId),
      supabase.from('groups').select('*').eq('user_id', userId),
      supabase.from('schedules').select('*').eq('user_id', userId)
    ]);

  if (e1 || e2 || e3) {
    console.error(`❌ [${userId}] Erro ao ler do Supabase:`, (e1 || e2 || e3).message);
    return { products: [], groups: [], schedules: [] };
  }

  const products = (productsRaw || []).map(p => ({
    id: p.id, name: p.name, oldPrice: p.old_price, price: p.price,
    link: p.link, imageUrl: p.image_url, category: p.category
  }));
  const groups = (groupsRaw || []).map(g => ({
    id: g.id, name: g.name, gid: g.whatsapp_gid, role: g.role
  }));
  const schedules = (schedulesRaw || []).map(s => ({
    id: s.id, time: s.time, repeat: s.repeat,
    groupIds: s.group_ids || [], categoria: s.category || null
  }));

  return { products, groups, schedules };
}

function resolverGrupos(ag, config) {
  const ids = [];
  (ag.groupIds || []).forEach(gid => {
    const grupo = config.groups.find(g => String(g.id) === String(gid));
    if (grupo && grupo.gid) ids.push(grupo.gid);
  });
  return ids;
}

async function enviarMensagem(sock, jid, texto, imageUrl, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      if (imageUrl && imageUrl.startsWith('http')) {
        await sock.sendMessage(jid, { image: { url: imageUrl }, caption: texto });
      } else {
        await sock.sendMessage(jid, { text: texto });
      }
      return true;
    } catch (e) {
      console.error(`   ⚠️  Tentativa ${i}/${tentativas} falhou: ${e.message}`);
      if (i < tentativas) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

function cancelarJobsUsuario(userId) {
  const jobs = jobsPorUsuario.get(userId) || [];
  jobs.forEach(j => j.job.cancel());
  jobsPorUsuario.set(userId, []);
}

// ─── AGENDAR MENSAGENS DE UM USUÁRIO ────────────────────────────────────────
async function agendarMensagensUsuario(userId) {
  cancelarJobsUsuario(userId);
  const config = await lerConfigUsuario(userId);
  const novosJobs = [];

  if (!config.schedules.length) return;

  config.schedules.forEach(ag => {
    if (!ag.time) return;
    const [hora, minuto] = ag.time.split(':').map(Number);
    const grupoIds = resolverGrupos(ag, config);
    if (!grupoIds.length) return;

    const rule = new schedule.RecurrenceRule();
    if (ag.repeat === 'weekdays') rule.dayOfWeek = [1, 2, 3, 4, 5];
    rule.hour = hora;
    rule.minute = minuto;
    rule.second = 0;
    rule.tz = 'America/Sao_Paulo';

    const job = schedule.scheduleJob(rule, async () => {
      const sock = sockets.get(userId);
      if (!sock) {
        console.log(`❌ [${userId}] Bot desconectado! Mensagem não enviada.`);
        return;
      }

      const configAtual = await lerConfigUsuario(userId);
      const categoriaForcada = ag.categoria || null;
      const grupos = resolverGrupos(ag, configAtual);

      for (const id of grupos) {
        const grupoInfo = (configAtual.groups || []).find(g => g.gid === id);
        const nomeGrupoAtual = grupoInfo ? grupoInfo.name : '';
        const grupoIdAtual = grupoInfo ? String(grupoInfo.id) : id;

        const resultado = agente.gerarParaGrupo(configAtual.products, hora, nomeGrupoAtual, grupoIdAtual, categoriaForcada);
        if (!resultado) continue;

        const ok = await enviarMensagem(sock, id, resultado.mensagem, resultado.imageUrl);
        console.log(`   [${userId}] ${ok ? '✅ Enviado' : '❌ Falhou'}: ${nomeGrupoAtual}`);
        await new Promise(r => setTimeout(r, 4000));
      }
    });

    if (job) novosJobs.push({ job, time: ag.time });
  });

  jobsPorUsuario.set(userId, novosJobs);
  console.log(`⏰ [${userId}] ${novosJobs.length} horário(s) ativo(s)`);
}

// ─── INICIAR CONEXÃO DE UM USUÁRIO ──────────────────────────────────────────
async function iniciarConexaoUsuario(userId) {
  if (sockets.has(userId)) return; // já conectado ou conectando

  console.log(`\n🔌 [${userId}] Iniciando conexão...`);
  const { state, saveCreds } = await useSupabaseAuthState(userId);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: require('pino')({ level: 'silent' }) });
  sockets.set(userId, sock);

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      console.log(`📱 [${userId}] QR Code gerado.`);
      qrcodeTerminal.generate(qr, { small: true });
      try {
        const qrImage = await QRCode.toDataURL(qr);
        await supabase.from('bot_status').upsert({
          user_id: userId, status: 'qr', qr_code: qrImage, updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.error(`❌ [${userId}] Erro ao salvar QR:`, e.message);
      }
    }

    if (connection === 'open') {
      console.log(`✅ [${userId}] CONECTADO!`);
      await supabase.from('bot_status').upsert({
        user_id: userId, status: 'connected', qr_code: null, updated_at: new Date().toISOString()
      });
      setTimeout(async () => {
        try {
          const grupos = await sock.groupFetchAllParticipating();
          const registros = Object.entries(grupos).map(([id, g]) => ({
            user_id: userId, gid: id, name: g.subject, updated_at: new Date().toISOString()
          }));
          if (registros.length) await supabase.from('whatsapp_groups_available').upsert(registros);
          console.log(`💾 [${userId}] ${registros.length} grupo(s) salvo(s).`);
        } catch (e) {}
        await agendarMensagensUsuario(userId);
      }, 3000);
    }

    if (connection === 'close') {
      sockets.delete(userId);
      cancelarJobsUsuario(userId);
      const deslogado = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      await supabase.from('bot_status').upsert({
        user_id: userId, status: 'disconnected', qr_code: null, updated_at: new Date().toISOString()
      });
      if (!deslogado) {
        console.log(`🔄 [${userId}] Reconectando em 5s...`);
        setTimeout(() => iniciarConexaoUsuario(userId), 5000);
      } else {
        console.log(`❌ [${userId}] Sessão encerrada (logout). Precisa reconectar via painel.`);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// ─── ESCUTAR PEDIDOS DE CONEXÃO E MUDANÇAS DE CONFIG ────────────────────────
function monitorarSupabase() {
  supabase
    .channel('vendabot-bot-status')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, (payload) => {
      const row = payload.new;
      if (row && row.status === 'requested' && !sockets.has(row.user_id)) {
        iniciarConexaoUsuario(row.user_id);
      }
    })
    .subscribe((status) => console.log(`📡 [bot_status] Realtime: ${status}`));

  supabase
    .channel('vendabot-config-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (p) => recarregarUsuario(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, (p) => recarregarUsuario(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, (p) => recarregarUsuario(p))
    .subscribe((status) => console.log(`📡 [config] Realtime: ${status}`));

  function recarregarUsuario(payload) {
    const userId = (payload.new && payload.new.user_id) || (payload.old && payload.old.user_id);
    if (userId && sockets.has(userId)) {
      console.log(`🔄 [${userId}] Config mudou, reagendando...`);
      agendarMensagensUsuario(userId);
    }
  }
}

// ─── AO LIGAR: RECONECTA AUTOMATICAMENTE QUEM JÁ ESTAVA CONECTADO ───────────
async function reconectarUsuariosExistentes() {
  const { data, error } = await supabase
    .from('bot_status')
    .select('user_id')
    .in('status', ['connected', 'qr', 'requested']);

  if (error) { console.error('❌ Erro ao buscar usuários existentes:', error.message); return; }

  for (const row of data || []) {
    await iniciarConexaoUsuario(row.user_id);
  }
  console.log(`🔁 ${data?.length || 0} usuário(s) recarregado(s) ao iniciar.`);
}

process.on('uncaughtException', e => console.error('🔴 ERRO:', e.message));
process.on('unhandledRejection', e => console.error('🔴 ERRO PROMISE:', e.message || e));

console.log('🤖 VendaBot multi-tenant iniciando...\n');
monitorarSupabase();
reconectarUsuariosExistentes();
