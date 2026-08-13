// ╔══════════════════════════════════════════════════════╗
// ║   BOT VENDABOT — Agente IA + Supabase                ║
// ╚══════════════════════════════════════════════════════╝
// npm install @whiskeysockets/baileys qrcode-terminal node-schedule pino @supabase/supabase-js dotenv

require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const schedule = require('node-schedule');
const { createClient } = require('@supabase/supabase-js');
const agente = require('./agente');

// ─── SUPABASE ─────────────────────────────────────────────────────────────
// SUPABASE_URL e SUPABASE_SERVICE_KEY vêm de variáveis de ambiente (.env local
// ou configuradas direto no Render). SUPABASE_SERVICE_KEY é a chave "service_role"
// (ou sb_secret_...) — ela ignora RLS, por isso NUNCA deve ir pro GitHub.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_KEY no .env / variáveis de ambiente.');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

let sock;
let jobsAtivos = [];
let botConectado = false;

// ─── LER CONFIG DO SUPABASE ─────────────────────────────────────────────────
// Converte os nomes de coluna do banco (snake_case) pros nomes que o
// agente.js já espera (camelCase), pra não precisar mexer no agente.js.
async function lerConfig() {
  const [{ data: productsRaw, error: e1 }, { data: groupsRaw, error: e2 }, { data: schedulesRaw, error: e3 }] =
    await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('groups').select('*'),
      supabase.from('schedules').select('*')
    ]);

  if (e1 || e2 || e3) {
    console.error('❌ Erro ao ler do Supabase:', (e1 || e2 || e3).message);
    return { products: [], groups: [], schedules: [] };
  }

  const products = (productsRaw || []).map(p => ({
    id: p.id,
    name: p.name,
    oldPrice: p.old_price,
    price: p.price,
    link: p.link,
    imageUrl: p.image_url,
    category: p.category
  }));

  const groups = (groupsRaw || []).map(g => ({
    id: g.id,
    name: g.name,
    gid: g.whatsapp_gid,
    role: g.role
  }));

  const schedules = (schedulesRaw || []).map(s => ({
    id: s.id,
    time: s.time,
    repeat: s.repeat,
    groupIds: s.group_ids || [],
    categoria: s.category || null
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

async function enviarMensagem(jid, texto, imageUrl, tentativas = 3) {
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

function cancelarJobs() {
  jobsAtivos.forEach(j => j.job.cancel());
  jobsAtivos = [];
}

async function agendarMensagens() {
  cancelarJobs();
  const config = await lerConfig();

  console.log('\n──────────────────────────────────────');
  console.log(`📦 Produtos: ${config.products.length}`);
  console.log(`👥 Grupos: ${config.groups.length}`);
  console.log(`⏰ Horários agendados: ${config.schedules.length}`);
  console.log('──────────────────────────────────────\n');

  if (!config.schedules.length) {
    console.log('📭 Nenhum horário agendado ainda.\n');
    return;
  }

  config.schedules.forEach(ag => {
    if (!ag.time) return;
    const [hora, minuto] = ag.time.split(':').map(Number);
    const grupoIds = resolverGrupos(ag, config);

    if (!grupoIds.length) {
      console.log(`❌ Horário ${ag.time} sem grupos válidos`);
      return;
    }

    const rule = new schedule.RecurrenceRule();
    if (ag.repeat === 'weekdays') rule.dayOfWeek = [1, 2, 3, 4, 5];
    rule.hour = hora;
    rule.minute = minuto;
    rule.second = 0;

    const job = schedule.scheduleJob(rule, async () => {
      console.log(`\n⏰⏰⏰ DISPARANDO [${ag.time}] ⏰⏰⏰`);

      if (!botConectado) {
        console.log('❌ Bot desconectado! Mensagem não enviada.');
        return;
      }

      const configAtual = await lerConfig();
      const categoriaForcada = ag.categoria || null;
      const grupos = resolverGrupos(ag, configAtual);
      console.log(`📍 Enviando para ${grupos.length} grupo(s)`);

      let sucesso = 0, falha = 0;
      for (const id of grupos) {
        const grupoInfo = (configAtual.groups || []).find(g => g.gid === id);
        const nomeGrupoAtual = grupoInfo ? grupoInfo.name : '';
        const grupoIdAtual = grupoInfo ? String(grupoInfo.id) : id;

        const resultado = agente.gerarParaGrupo(configAtual.products, hora, nomeGrupoAtual, grupoIdAtual, categoriaForcada);
        if (!resultado) { console.log(`   ⚠️  Sem produto para: ${nomeGrupoAtual}`); falha++; continue; }

        console.log(`   📝 "${resultado.mensagem.substring(0, 60)}..."`);
        const ok = await enviarMensagem(id, resultado.mensagem, resultado.imageUrl);
        if (ok) { console.log(`   ✅ Enviado: ${nomeGrupoAtual}`); sucesso++; }
        else { console.log(`   ❌ Falhou: ${nomeGrupoAtual}`); falha++; }
        await new Promise(r => setTimeout(r, 4000));
      }
      console.log(`\n📊 Resultado: ${sucesso} enviado(s), ${falha} falhou\n`);
    });

    if (job) {
      jobsAtivos.push({ job, time: ag.time });
      console.log(`✅ Horário ativo: ${ag.time} → ${grupoIds.length} grupo(s) → Agente escolhe o produto`);
    }
  });

  console.log(`\n🟢 TOTAL DE HORÁRIOS ATIVOS: ${jobsAtivos.length}`);
  console.log('🧠 Agente IA vai escolher e gerar as copys automaticamente!\n');
}

// ─── MONITORAR MUDANÇAS EM TEMPO REAL (Supabase Realtime) ──────────────────
// Em vez de checar um arquivo local a cada X segundos (como era com o
// config.json), o bot escuta mudanças nas 3 tabelas via Realtime e
// reagenda automaticamente quando algo muda.
function monitorarConfig() {
  const canal = supabase
    .channel('vendabot-config-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, recarregar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, recarregar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, recarregar)
    .subscribe();

  console.log('👁️  Monitorando Supabase em tempo real — atualização automática ativa!\n');

  async function recarregar() {
    console.log('\n🔄 Mudança detectada no Supabase! Recarregando...');
    await agendarMensagens();
  }
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: require('pino')({ level: 'silent' }) });

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) { console.log('\n📱 Escaneie o QR Code:\n'); qrcode.generate(qr, { small: true }); }
    if (connection === 'open') {
      botConectado = true;
      console.log('\n✅✅✅ BOT CONECTADO! ✅✅✅\n');
      setTimeout(async () => {
        try {
          const grupos = await sock.groupFetchAllParticipating();
          console.log('📋 Seus grupos:');
          Object.entries(grupos).forEach(([id, g]) => console.log(`   "${g.subject}" → ${id}`));
          console.log('');
        } catch (e) {}
        await agendarMensagens();
        monitorarConfig();
      }, 3000);
    }
    if (connection === 'close') {
      botConectado = false;
      const ok = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (ok) { console.log('🔄 Reconectando...'); setTimeout(conectar, 5000); }
      else console.log('❌ Sessão encerrada. Delete a pasta auth e rode novamente.');
    }
  });
  sock.ev.on('creds.update', saveCreds);
}

process.on('uncaughtException', e => console.error('🔴 ERRO:', e.message));
process.on('unhandledRejection', e => console.error('🔴 ERRO PROMISE:', e.message || e));

console.log('🤖 VendaBot + Agente IA iniciando...\n');
conectar();
