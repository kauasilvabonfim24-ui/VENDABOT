// ╔══════════════════════════════════════════════════════╗
// ║   BOT VENDABOT — Multi-tenant (várias conexões)      ║
// ╚══════════════════════════════════════════════════════╝
// npm install @whiskeysockets/baileys qrcode-terminal qrcode node-schedule pino @supabase/supabase-js dotenv

import 'dotenv/config';
import makeWASocket, { DisconnectReason, initAuthCreds, BufferJSON, proto, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import schedule from 'node-schedule';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import http from 'http';
import * as agente from './agente.js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_KEY no .env / variáveis de ambiente.');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── ESTADO EM MEMÓRIA (por processo) ────────────────────────────────────────
const sockets = new Map();       // user_id -> socket Baileys ativo
const jobsPorUsuario = new Map(); // user_id -> array de jobs agendados
const pairingPendente = new Set(); // user_id -> já pediu código de pareamento nessa rodada, aguardando o usuário digitar
const pairingCodigoGeradoEm = new Map(); // user_id -> timestamp de quando o último código de pareamento foi emitido
const pairingFalhasRapidas = new Map(); // user_id -> quantas vezes seguidas a conexão caiu rápido demais após o código (ver PAIRING_FALHA_RAPIDA_MS)
const PAIRING_FALHA_RAPIDA_MS = 20000; // menos que isso entre "código emitido" e "caiu" é cedo demais pra ser o usuário digitando errado/desistindo
const PAIRING_MAX_TENTATIVAS_AUTOMATICAS = 3; // depois de N quedas rápidas seguidas, desiste de verdade e avisa o usuário
const reconectandoAposQueda = new Set(); // user_id -> caiu e está no meio da reconexão automática (pra notificar só quando voltar)
const socketGeracao = new Map(); // user_id -> número da tentativa de conexão atual. Todo socket novo incrementa esse
// número; os handlers de eventos do socket ANTERIOR (que pode levar alguns segundos pra
// terminar de se desligar de verdade) checam esse número e viram no-op se já foram
// superados. Sem isso, um socket velho ainda "morrendo" pode sobrescrever o status/estado
// do socket novo no meio de uma reconexão rápida (ex: usuário clicando "gerar novo código"
// mais de uma vez), causando logout/timeout fantasma no socket novo.

// ─── AQUECIMENTO DO SERVIDOR ─────────────────────────────────────────────────
// Logo após o processo subir (ex: acabou de acordar de hibernação/redeploy no
// plano free do Render), a instância fica instável por alguns segundos — rede
// lenta, CPU compartilhada em throttling. Tentar QR/pareamento nesse momento
// falha ou expira o código à toa. Por isso adiamos qualquer tentativa de conexão
// nova até esse período passar, e devolvemos um status "iniciando" pro painel
// enquanto isso, em vez de deixar o cliente tomar um erro seco do WhatsApp.
const SERVER_START = Date.now();
const AQUECIMENTO_MS = 20000; // 20s
function aindaAquecendo() {
  return Date.now() - SERVER_START < AQUECIMENTO_MS;
}

// ─── VERSÃO DO PROTOCOLO WHATSAPP (cacheada) ────────────────────────────────
// fetchLatestBaileysVersion() faz uma chamada de rede. Buscar isso do zero em
// TODA tentativa de conexão atrasa o momento em que o QR/código de pareamento
// aparece pro usuário — crítico no fluxo de pairing, onde o código do WhatsApp
// expira rápido (~60s). Por isso cacheamos em memória e só renovamos de tempos
// em tempos, em vez de bater na rede toda vez.
let waVersionCache = null;
let waVersionCacheEm = 0;
const WA_VERSION_CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas

async function obterVersaoWhatsApp(userId) {
  const agora = Date.now();
  if (waVersionCache && (agora - waVersionCacheEm) < WA_VERSION_CACHE_MS) {
    return waVersionCache;
  }
  try {
    const { version } = await fetchLatestBaileysVersion();
    waVersionCache = version;
    waVersionCacheEm = agora;
    console.log(`🔄 [${userId}] Versão do protocolo WhatsApp atualizada: ${version.join('.')}`);
  } catch (e) {
    console.error(`⚠️ [${userId}] Não foi possível buscar a versão mais recente, usando cache/padrão do pacote:`, e.message);
    // Mantém o cache antigo (se houver) em vez de derrubar a conexão por causa disso.
  }
  return waVersionCache; // pode ser null na primeiríssima vez que a busca falhar — Baileys cai pro padrão do pacote
}

// ─── NOTIFICAÇÃO PUSH (OneSignal via Edge Function send-push) ──────────────
// Não quebra o bot se faltar a env var ou se a chamada falhar — só loga o erro.
async function enviarNotificacaoPush(userId, title, message) {
  if (!process.env.INTERNAL_TRIGGER_SECRET) {
    console.warn(`⚠️ [${userId}] INTERNAL_TRIGGER_SECRET não configurado no Render — pulando notificação.`);
    return;
  }
  try {
    const resp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.INTERNAL_TRIGGER_SECRET, user_id: userId, title, message })
    });
    const result = await resp.json().catch(() => null);
    console.log(`🔔 [${userId}] Notificação (${title}): ${resp.ok ? 'enviada' : 'falhou'}`, result || '');
  } catch (e) {
    console.error(`❌ [${userId}] Erro ao notificar (${title}):`, e.message);
  }
}

async function notificarReconexao(userId) {
  await enviarNotificacaoPush(userId, 'Bot reconectado ✅', 'Seu WhatsApp voltou a ficar conectado e já está enviando mensagens normalmente.');
}

async function notificarPrimeiroEnvio(userId, nomeGrupo) {
  await enviarNotificacaoPush(
    userId,
    'Primeira mensagem enviada! 🎉',
    `Sua primeira oferta já saiu com sucesso no grupo "${nomeGrupo}". O VendaBot está funcionando e vai continuar disparando nos horários que você configurou.`
  );
}

// ─── SERVIDOR HTTP MÍNIMO (satisfaz o Health Check do Render) ───────────────
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

// Reconhece o padrão de erro que o WhatsApp devolve quando o bot tenta mandar
// mensagem num grupo onde só administradores podem postar (bot é membro comum).
function ehErroDePermissao(e) {
  const codigo = e?.output?.statusCode;
  const msg = (e?.message || '').toLowerCase();
  return codigo === 403 || msg.includes('forbidden') || msg.includes('not-authorized') || msg.includes('not authorized');
}

async function enviarMensagem(sock, jid, texto, imageUrl, tentativas = 3) {
  let ultimoErro = null;
  for (let i = 1; i <= tentativas; i++) {
    try {
      if (imageUrl && imageUrl.startsWith('http')) {
        await sock.sendMessage(jid, { image: { url: imageUrl }, caption: texto });
      } else {
        await sock.sendMessage(jid, { text: texto });
      }
      return { ok: true, error: null, semPermissao: false };
    } catch (e) {
      ultimoErro = e;
      console.error(`   ⚠️  Tentativa ${i}/${tentativas} falhou: ${e.message}`);
      if (ehErroDePermissao(e)) break; // sem permissão não resolve tentando de novo
      if (i < tentativas) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { ok: false, error: ultimoErro?.message || 'Erro desconhecido', semPermissao: ehErroDePermissao(ultimoErro || {}) };
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

        const resultado2 = await enviarMensagem(sock, id, resultado.mensagem, resultado.imageUrl);
        console.log(`   [${userId}] ${resultado2.ok ? '✅ Enviado' : '❌ Falhou'}: ${nomeGrupoAtual}`);

        await supabase.from('message_logs').insert({
          user_id: userId,
          group_id: grupoIdAtual,
          group_name: nomeGrupoAtual,
          status: resultado2.ok ? 'enviado' : 'erro',
          error_message: resultado2.ok ? null : resultado2.error
        });

        if (resultado2.ok) {
          const { count } = await supabase
            .from('message_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'enviado');
          if (count === 1) {
            // Primeira mensagem que esse usuário já conseguiu enviar de verdade —
            // notifica na hora, pra ele ver logo que o bot está funcionando de
            // fato (em vez de ficar sem noticia nenhuma até o próximo horário).
            await notificarPrimeiroEnvio(userId, nomeGrupoAtual);
          }
        }

        if (!resultado2.ok && resultado2.semPermissao) {
          await enviarNotificacaoPush(
            userId,
            'Mensagem não enviada ⚠️',
            `Não conseguimos mandar mensagem no grupo "${nomeGrupoAtual}". Verifique se o bot ainda é participante e se o grupo permite que qualquer participante envie mensagens (grupos com "somente admins" bloqueiam o bot).`
          );
        }

        await new Promise(r => setTimeout(r, 4000));
      }
    });

    if (job) novosJobs.push({ job, time: ag.time });
  });

  jobsPorUsuario.set(userId, novosJobs);
  console.log(`⏰ [${userId}] ${novosJobs.length} horário(s) ativo(s)`);
}

// ─── INICIAR CONEXÃO DE UM USUÁRIO ──────────────────────────────────────────
async function iniciarConexaoUsuario(userId, metodo = 'qr', telefone = null) {
  if (sockets.has(userId)) return; // já conectado ou conectando

  console.log(`\n🔌 [${userId}] Iniciando conexão (método: ${metodo})...`);
  const { state, saveCreds } = await useSupabaseAuthState(userId);

  // Versão do protocolo do WhatsApp, cacheada (ver obterVersaoWhatsApp acima) —
  // evita atrasar o QR/código de pareamento com uma busca de rede toda vez.
  const waVersion = await obterVersaoWhatsApp(userId);

  const minhaGeracao = (socketGeracao.get(userId) || 0) + 1;
  socketGeracao.set(userId, minhaGeracao);

  const sock = makeWASocket({
    auth: state,
    version: waVersion, // undefined aqui faz o Baileys cair de volta na versão padrão do pacote
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Chrome')
  });
  sockets.set(userId, sock);

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    // Socket superado por uma nova tentativa de conexão (ex: usuário pediu novo código
    // de pareamento enquanto este ainda estava terminando de se desligar) — ignora.
    if (socketGeracao.get(userId) !== minhaGeracao) return;

    // O evento 'qr' é o sinal de que a conexão terminou o handshake inicial e está
    // pronta pra autenticação — tanto pro fluxo de QR quanto pro de pairing. Pedir o
    // código de pareamento ANTES desse sinal (logo após criar o socket) é o que causava
    // "código gerado mas rejeitado/não conecta quando digitado": o pedido saía cedo
    // demais, antes do WhatsApp confirmar que a sessão estava pronta pra receber ele.
    if (qr && metodo === 'pairing' && telefone && !state.creds.registered && !pairingPendente.has(userId)) {
      try {
        const numeroLimpo = telefone.replace(/\D/g, '');
        const code = await sock.requestPairingCode(numeroLimpo);
        pairingPendente.add(userId);
        pairingCodigoGeradoEm.set(userId, Date.now());
        console.log(`🔑 [${userId}] Código de pareamento: ${code}`);
        await supabase.from('bot_status').upsert({
          user_id: userId, status: 'pairing', pairing_code: code, qr_code: null,
          connection_method: 'pairing', updated_at: new Date().toISOString()
        });
        // Importante: NÃO colocamos um timer local pra "expirar" essa trava sozinha.
        // Só um novo pedido explícito do usuário (clique em "Gerar novo código", que já
        // limpa isso lá embaixo em monitorarSupabase) deve liberar gerar um código novo.
      } catch (e) {
        console.error(`❌ [${userId}] Erro ao gerar código de pareamento:`, e.message);
        pairingPendente.delete(userId);
        await supabase.from('bot_status').upsert({
          user_id: userId, status: 'disconnected', pairing_code: null,
          updated_at: new Date().toISOString()
        });
      }
    } else if (qr && metodo !== 'pairing') {
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
      pairingPendente.delete(userId);
      pairingFalhasRapidas.delete(userId);
      console.log(`✅ [${userId}] CONECTADO!`);
      await supabase.from('bot_status').upsert({
        user_id: userId, status: 'connected', qr_code: null, updated_at: new Date().toISOString()
      });
      if (reconectandoAposQueda.has(userId)) {
        reconectandoAposQueda.delete(userId);
        notificarReconexao(userId); // dispara em segundo plano, não trava o fluxo de conexão
      }
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

      // No pareamento, o WhatsApp às vezes derruba a conexão com o MESMO código de
      // "logout" (401) só alguns segundos depois de emitir o código — antes de dar
      // tempo real da pessoa nem abrir o WhatsApp pra digitar. Tratar isso como logout
      // de verdade (que apaga a sessão salva) jogava o usuário num loop de "gera código
      // -> cai sozinho -> gera outro código -> cai de novo". Por isso só tratamos como
      // logout definitivo se: não é pareamento, OU já demorou tempo suficiente pra ser
      // uma rejeição de verdade, OU já tentamos de novo automaticamente demais.
      const geradoEm = pairingCodigoGeradoEm.get(userId) || 0;
      const caiuRapidoDemaisAposCodigo = metodo === 'pairing' && (Date.now() - geradoEm) < PAIRING_FALHA_RAPIDA_MS;
      const tentativasRapidas = pairingFalhasRapidas.get(userId) || 0;
      const tentarDeNovoSemApagar = deslogado && caiuRapidoDemaisAposCodigo && tentativasRapidas < PAIRING_MAX_TENTATIVAS_AUTOMATICAS;
      const deslogadoDeVerdade = deslogado && !tentarDeNovoSemApagar;

      // Se ainda estamos dentro da janela de um pairing code pendente (e não é um
      // logout de verdade), essa é a desconexão esperada logo após gerar o código —
      // não apaga o código que está na tela do usuário, senão o app mostra
      // "desconectado" à toa enquanto a pessoa ainda está tentando digitar.
      const aguardandoDigitacao = metodo === 'pairing' && pairingPendente.has(userId) && !deslogadoDeVerdade;
      if (!aguardandoDigitacao) {
        await supabase.from('bot_status').upsert({
          user_id: userId, status: 'disconnected', qr_code: null, pairing_code: null,
          updated_at: new Date().toISOString()
        });
      }
      if (!deslogadoDeVerdade) {
        if (tentarDeNovoSemApagar) {
          pairingFalhasRapidas.set(userId, tentativasRapidas + 1);
          pairingPendente.delete(userId); // libera gerar um código novo na próxima tentativa
          console.log(`🔁 [${userId}] Pareamento caiu rápido demais (tentativa ${tentativasRapidas + 1}/${PAIRING_MAX_TENTATIVAS_AUTOMATICAS}), tentando de novo sem apagar a sessão...`);
        } else {
          console.log(`🔄 [${userId}] Reconectando em 5s...`);
        }
        reconectandoAposQueda.add(userId);
        setTimeout(() => iniciarConexaoUsuario(userId, metodo, telefone), 5000);
      } else {
        console.log(`❌ [${userId}] Sessão encerrada (logout). Limpando sessão salva...`);
        pairingPendente.delete(userId);
        pairingFalhasRapidas.delete(userId);
        await supabase.from('bot_auth_state').delete().eq('user_id', userId);
        if (metodo === 'pairing' && deslogado) {
          await enviarNotificacaoPush(
            userId,
            'Não foi possível conectar por número ⚠️',
            'Tivemos dificuldade pra conectar usando o código por número dessa vez. Tente novamente ou use a conexão por QR code, que costuma ser mais estável.'
          );
        }
      }
    }
  });

  sock.ev.on('creds.update', async (...args) => {
    if (socketGeracao.get(userId) !== minhaGeracao) return; // socket superado, ignora
    await saveCreds(...args);
  });
}

// ─── ESCUTAR PEDIDOS DE CONEXÃO E MUDANÇAS DE CONFIG ────────────────────────
function monitorarSupabase() {
  supabase
    .channel('vendabot-bot-status')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, async (payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.status === 'requested') {
        const socketPreso = sockets.get(row.user_id);
        if (socketPreso) {
          // Invalida os handlers do socket antigo JÁ, antes mesmo dele terminar de se
          // desligar de verdade — é isso que impede ele de sobrescrever o status do novo.
          socketGeracao.set(row.user_id, (socketGeracao.get(row.user_id) || 0) + 1);
          try { socketPreso.end(new Error('Nova tentativa de conexão solicitada')); } catch (e) {}
          sockets.delete(row.user_id);
        }
        pairingPendente.delete(row.user_id); // pedido explícito de nova tentativa: libera gerar código novo
        pairingFalhasRapidas.delete(row.user_id); // conta as tentativas automáticas do zero de novo

        if (aindaAquecendo()) {
          const faltam = AQUECIMENTO_MS - (Date.now() - SERVER_START);
          console.log(`🔥 [${row.user_id}] Servidor ainda aquecendo, adiando conexão em ${Math.ceil(faltam / 1000)}s...`);
          await supabase.from('bot_status').upsert({
            user_id: row.user_id, status: 'iniciando', qr_code: null, pairing_code: null,
            updated_at: new Date().toISOString()
          });
          setTimeout(() => {
            iniciarConexaoUsuario(row.user_id, row.connection_method || 'qr', row.phone_number || null);
          }, faltam + 500);
        } else {
          iniciarConexaoUsuario(row.user_id, row.connection_method || 'qr', row.phone_number || null);
        }
      }
      if (row.status === 'disconnect_requested') {
        const sock = sockets.get(row.user_id);
        if (sock) {
          socketGeracao.set(row.user_id, (socketGeracao.get(row.user_id) || 0) + 1);
          try { await sock.logout(); } catch (e) { console.error(`❌ [${row.user_id}] Erro ao desconectar:`, e.message); }
          sockets.delete(row.user_id);
        }
        pairingPendente.delete(row.user_id);
        await supabase.from('bot_status').upsert({
          user_id: row.user_id, status: 'disconnected', qr_code: null, pairing_code: null,
          updated_at: new Date().toISOString()
        });
        await supabase.from('bot_auth_state').delete().eq('user_id', row.user_id);
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
    .select('user_id, connection_method, phone_number')
    .in('status', ['connected', 'qr', 'requested', 'pairing']);

  if (error) { console.error('❌ Erro ao buscar usuários existentes:', error.message); return; }

  for (const row of data || []) {
    await iniciarConexaoUsuario(row.user_id, row.connection_method || 'qr', row.phone_number || null);
  }
  console.log(`🔁 ${data?.length || 0} usuário(s) recarregado(s) ao iniciar.`);
}

process.on('uncaughtException', e => console.error('🔴 ERRO:', e.message));
process.on('unhandledRejection', e => console.error('🔴 ERRO PROMISE:', e.message || e));

console.log('🤖 VendaBot multi-tenant iniciando...\n');
monitorarSupabase();
setTimeout(() => {
  console.log('🔥 Aquecimento concluído, reconectando usuários existentes...');
  reconectarUsuariosExistentes();
}, AQUECIMENTO_MS);
