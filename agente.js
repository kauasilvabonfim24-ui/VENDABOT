// ╔══════════════════════════════════════════════════════════════╗
// ║   AGENTE IA KAUÃ v5 — Round-robin real + histórico persistente║
// ║                                                                ║
// ║   Mudanças desta versão (zero mudança no bot.js, mesma         ║
// ║   assinatura de gerarParaGrupo/gerarParaHorario):               ║
// ║                                                                ║
// ║   1) PERSISTÊNCIA: o histórico de produto/copy por grupo agora ║
// ║      é salvo na tabela `agente_historico` do Supabase (mesmo   ║
// ║      projeto que já guarda bot_auth_state), em vez de só na    ║
// ║      memória do processo. Como o Render free reinicia/derruba  ║
// ║      a instância com frequência, um arquivo local no disco     ║
// ║      seria perdido do mesmo jeito — Supabase sobrevive a isso. ║
// ║      O histórico é carregado uma vez na subida do módulo (top- ║
// ║      level await, então já está pronto antes do bot.js seguir  ║
// ║      em frente) e cada uso é salvo em background (fire-and-    ║
// ║      forget) sem travar o envio de mensagem.                   ║
// ║                                                                ║
// ║   2) ROUND-ROBIN DE VERDADE: antes, só evitava repetir os      ║
// ║      últimos 3 produtos/copys. Agora cada grupo passa por      ║
// ║      TODOS os produtos válidos daquele contexto (e por TODAS   ║
// ║      as copys) antes de qualquer um poder repetir — só reseta  ║
// ║      quando o "baralho" daquele subconjunto acaba.             ║
// ║                                                                ║
// ║   3) MAIS VARIEDADE DE COPY: de 16 para 28 modelos (20 geral + ║
// ║      8 motoboy), com estilos diferentes — urgência, pergunta,  ║
// ║      benefício direto, storytelling curto — não só emoji       ║
// ║      trocado.                                                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from '@supabase/supabase-js';

// ─── SUPABASE (mesmas variáveis de ambiente que o bot.js já usa) ───────────
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
} else {
  console.warn('⚠️  Agente: SUPABASE_URL/SUPABASE_SERVICE_KEY não encontrados — histórico do agente vai funcionar só em memória (não sobrevive a reinício).');
}

// ─── NORMALIZAÇÃO DE TEXTO (ignora acento/maiúsculas na comparação) ─────────
function normalizar(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ─── SAUDAÇÃO POR HORA ───────────────────────────────────────────────────────
function getSaudacao(hora) {
  if (hora >= 5 && hora < 12) return 'BOM DIA';
  if (hora >= 12 && hora < 18) return 'BOA TARDE';
  return 'BOA NOITE';
}

// ─── COPYS GERAIS (20 modelos, estilos variados) ────────────────────────────
const COPYS_GERAIS = [
  `🌞 *{SAUDACAO}! TEM OFERTA BOA HOJE!* 🌞\n🔥 *{NOME}* 🔥\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por apenas: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ Aproveite enquanto a promoção estiver disponível.\n👉 Confira aqui:\n{LINK}`,
  `🚨 *ACHADO DO DIA!* 🚨\n👀 Encontrei essa promoção e vim compartilhar!\n📦 *{NOME}*\n❌ De: ~~R$ {PRECO_ANTIGO}~~\n💥 Hoje por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Veja antes que o estoque acabe!\n{LINK}`,
  `☀️ *{SAUDACAO}, PESSOAL!*\n🔥 Promoção disponível!\n📦 *{NOME}*\n💰 ~~R$ {PRECO_ANTIGO}~~\n✅ Agora por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Vale a pena conferir.\n👉 {LINK}`,
  `🎁 *OFERTA ESPECIAL DO DIA* 🎁\n🔥 *{NOME}*\n💸 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Aproveite enquanto durar.\n👉 {LINK}`,
  `🚀 *PROMOÇÃO LIBERADA!*\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n🔥 Por apenas *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ O preço pode mudar a qualquer momento.\n👉 {LINK}`,
  `💥 *SUPER OFERTA!* 💥\n🛍️ *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n✅ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Dá uma olhada nessa promoção.\n👉 {LINK}`,
  `📢 *PROMOÇÃO RELÂMPAGO!*\n🔥 *{NOME}*\n💲 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Agora: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚠️ Aproveite enquanto o desconto estiver ativo.\n👉 {LINK}`,
  `🎯 *OFERTA QUE VALE A PENA!*\n📦 *{NOME}*\n💸 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n✨ Excelente oportunidade.\n👉 {LINK}`,
  `🔥 *CORRE QUE BAIXOU!*\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n✅ Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Confere aí!\n👉 {LINK}`,
  `🌟 *OFERTA DO MOMENTO* 🌟\n📦 *{NOME}*\n💵 De: ~~R$ {PRECO_ANTIGO}~~\n🔥 Agora por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🚀 Aproveite a promoção.\n👉 {LINK}`,
  `🤔 *Já tá precisando disso?*\n📦 *{NOME}*\n💰 Preço lá em cima: ~~R$ {PRECO_ANTIGO}~~\n✅ Aqui: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Dá uma olhada:\n{LINK}`,
  `✅ *RESOLVE NA HORA!*\n📦 *{NOME}*\n💰 Sai por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n❌ Preço normal: ~~R$ {PRECO_ANTIGO}~~\n🙌 Prático, útil e no precinho.\n👉 {LINK}`,
  `📝 *Relato rápido:* achei esse aqui navegando e vim avisar.\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~ por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Vale conferir:\n{LINK}`,
  `⏰ *ÚLTIMAS HORAS DE PREÇO ASSIM!*\n🔥 *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n✅ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏃 Corre que não demora a voltar ao normal.\n👉 {LINK}`,
  `👀 *Quem aqui tava esperando baixar?*\n📦 *{NOME}*\n💸 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Agora é a hora:\n{LINK}`,
  `🙋 *PRA FACILITAR O DIA A DIA*\n📦 *{NOME}*\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n✨ Simples e direto ao ponto.\n👉 {LINK}`,
  `🗣️ *Chegou pedido de indicação — segue!*\n📦 *{NOME}*\n💰 ~~R$ {PRECO_ANTIGO}~~ por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Olha só:\n{LINK}`,
  `*{NOME}*\nDe R$ {PRECO_ANTIGO} por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\nLink pra garantir o preço:\n{LINK}`,
  `👥 *A galera tá comprando esse aqui!*\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n✅ Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 {LINK}`,
  `💭 *Cansado de pagar caro nisso?*\n📦 *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n✅ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 {LINK}`
];

// ─── COPYS MOTOBOY (8 modelos, estilos variados) ────────────────────────────
const COPYS_MOTOBOY = [
  `🏍️ *ACHADO PARA MOTOCA!* 🏍️\n🔥 *{NOME}*\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por apenas: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Produto aprovado pelos irmãos do asfalto!\n👉 Confira:\n{LINK}`,
  `🛵 *PROMOÇÃO PRA QUEM TÁ NA RODA!* 🛵\n📦 *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n💥 Agora por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Essencial pra quem vive de moto!\n👉 {LINK}`,
  `🚨 *ATENÇÃO MOTOBOYS!* 🚨\n📢 Oferta imperdível chegou!\n🏍️ *{NOME}*\n💸 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ Corre que é por tempo limitado!\n👉 {LINK}`,
  `⚡ *OFERTA RELÂMPAGO PARA MOTOCA!* ⚡\n🛵 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n🔥 Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Perfeito pra quem roda todo dia!\n👉 {LINK}`,
  `🔥 *OLHA ESSE ACHADO, MOTOCA!*\n📦 *{NOME}*\n💵 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🛵 Quem é da vida não pode perder!\n⏳ Aproveite enquanto tem!\n👉 {LINK}`,
  `🪖 *EQUIPAMENTO BOM E BARATO!* 🪖\n🏍️ *{NOME}*\n❌ De: ~~R$ {PRECO_ANTIGO}~~\n✅ Hoje por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Segurança e economia andam juntas!\n👉 {LINK}`,
  `❓ *Motoboy, já tá com esse aí?*\n🏍️ *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n✅ Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 {LINK}`,
  `🗣️ *Motoboy aqui do grupo pediu indicação — segue!*\n🏍️ *{NOME}*\n💸 ~~R$ {PRECO_ANTIGO}~~ por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 {LINK}`
];

// ─── CATEGORIAS POR HORÁRIO (comparadas já sem acento, ver normalizar()) ────
const HORARIOS = {
  manha:   { min: 7,  max: 10, cats: ['uso diario','cafeteira','termica','mochila','tenis','roupa','smartwatch','fone','maquiagem','escova','kit'] },
  almoco:  { min: 11, max: 14, cats: ['impulso','capinha','power bank','carregador','bijuteria','bolsa','bone','sandalia','chinelo','relogio'] },
  tarde:   { min: 15, max: 18, cats: ['casa','air fryer','aspirador','panela','luminaria','organizador','decoracao','espelho','cabide'] },
  noite:   { min: 19, max: 22, cats: ['eletronico','smartphone','notebook','tv','games','headset','tenis','vestido','perfume','cosmetico','joia','bolsa feminina'] }
};

const DIAS_SEMANA = {
  0: ['esporte','academia','informatica','marmita','mochila','smartwatch'],       // Domingo
  5: ['churrasco','som bluetooth','games','lazer','cooler'],                      // Sexta
  6: ['moda','casa','tenis','decoracao','brinquedo','pet','roupa']                // Sábado
};

const SEMPRE_CONVERTE = ['air fryer','robo aspirador','smartwatch','fone bluetooth','carregador','power bank','tenis','perfume','bolsa','mochila','kit ferramentas','caixa de som','impressora','projetor'];

// ─── HISTÓRICO POR GRUPO (round-robin real, persistido no Supabase) ────────
// produtosRodada / copysRodada.{geral,motoboy}: Sets com os ids/índices já
// usados NESTA rodada do grupo. Um item só pode repetir depois que TODO o
// conjunto atual (baralho) foi usado — aí a rodada reseta sozinha.
const historicoPorGrupo = {};

function getHistorico(grupoId) {
  if (!historicoPorGrupo[grupoId]) {
    historicoPorGrupo[grupoId] = {
      produtosRodada: new Set(),
      copysRodada: { geral: new Set(), motoboy: new Set() },
      ultimoProduto: null,
      ultimaCopy: { geral: null, motoboy: null }
    };
  }
  return historicoPorGrupo[grupoId];
}

function hidratarGrupo(grupoId, row) {
  const h = getHistorico(grupoId);
  h.produtosRodada = new Set(row.produtos_rodada || []);
  h.copysRodada.geral = new Set(row.copys_rodada_geral || []);
  h.copysRodada.motoboy = new Set(row.copys_rodada_motoboy || []);
  h.ultimoProduto = row.ultimo_produto ?? null;
  h.ultimaCopy.geral = row.ultima_copy_geral ?? null;
  h.ultimaCopy.motoboy = row.ultima_copy_motoboy ?? null;
}

async function carregarHistoricoInicial() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('agente_historico').select('*');
    if (error) throw error;
    (data || []).forEach(row => hidratarGrupo(row.grupo_id, row));
    console.log(`🧠 Agente: histórico carregado do Supabase (${(data || []).length} grupo(s)).`);
  } catch (e) {
    console.error('⚠️  Agente: falha ao carregar histórico do Supabase, começando do zero:', e.message);
  }
}

// Top-level await: como bot.js faz `import * as agente from './agente.js'`,
// essa linha garante que o histórico já está carregado ANTES do bot.js
// continuar a execução — sem precisar chamar nada a mais lá.
await carregarHistoricoInicial();

function persistirHistorico(grupoId) {
  if (!supabase) return;
  const h = getHistorico(grupoId);
  supabase.from('agente_historico').upsert({
    grupo_id: String(grupoId),
    produtos_rodada: Array.from(h.produtosRodada),
    copys_rodada_geral: Array.from(h.copysRodada.geral),
    copys_rodada_motoboy: Array.from(h.copysRodada.motoboy),
    ultimo_produto: h.ultimoProduto,
    ultima_copy_geral: h.ultimaCopy.geral,
    ultima_copy_motoboy: h.ultimaCopy.motoboy,
    updated_at: new Date().toISOString()
  }, { onConflict: 'grupo_id' }).then(({ error }) => {
    if (error) console.error(`⚠️  Agente: falha ao salvar histórico do grupo ${grupoId}:`, error.message);
  }).catch(e => console.error(`⚠️  Agente: erro ao salvar histórico do grupo ${grupoId}:`, e.message));
}

function registrarUso(grupoId, produtoId) {
  const h = getHistorico(grupoId);
  h.produtosRodada.add(produtoId);
  h.ultimoProduto = produtoId;
  persistirHistorico(grupoId); // fire-and-forget, não trava o envio
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function calcularDesconto(precoAntigo, precoAtual) {
  const a = parseFloat(String(precoAntigo).replace(',', '.'));
  const b = parseFloat(String(precoAtual).replace(',', '.'));
  if (!a || !b || a <= b) return 0;
  return Math.round(((a - b) / a) * 100);
}

function isMotoboy(produto) {
  const palavras = ['motoboy','moto','delivery','capacete','luva','jaqueta','bag delivery','suporte celular','capa chuva','bota moto','cadeado moto','farol','buzina','retrovisor'];
  const texto = normalizar((produto.category || '') + ' ' + (produto.name || ''));
  return palavras.some(c => texto.includes(normalizar(c)));
}

function isGrupoMotoboy(nomeGrupo) {
  const palavras = ['motoboy','moto','delivery','motoca','piloto','rider','capacete'];
  const texto = normalizar(nomeGrupo);
  return palavras.some(p => texto.includes(normalizar(p)));
}

function getCategoriasPorContexto(hora, diaSemana) {
  if (DIAS_SEMANA[diaSemana]) return DIAS_SEMANA[diaSemana];
  for (const [, v] of Object.entries(HORARIOS)) {
    if (hora >= v.min && hora < v.max) return v.cats;
  }
  return SEMPRE_CONVERTE;
}

function produtoMatchCategoria(produto, categorias, categoriaForcada) {
  const texto = normalizar((produto.category || '') + ' ' + (produto.name || ''));
  if (categoriaForcada) return texto.includes(normalizar(categoriaForcada));
  return categorias.some(c => texto.includes(normalizar(c)));
}

// Dado um array de produtos já filtrados por uma regra (motoboy, categoria,
// etc), primeiro tira quem já foi usado NESTE MESMO disparo (outros grupos
// que já receberam mensagem agora há pouco, no mesmo ciclo do agendamento —
// essa regra nunca é relaxada). Dentro do que sobrar, tira quem já está na
// rodada atual do grupo (round-robin). Se isso esvaziar tudo, quer dizer que
// esse subconjunto específico já deu uma volta completa: libera de novo só
// os itens desse subconjunto (reseta a rodada apenas pra eles) e retorna o
// subconjunto inteiro.
function semRepetir(lista, hist, usadosNesteCiclo) {
  if (!lista.length) return lista;
  const foraDoDisparo = lista.filter(p => !usadosNesteCiclo.has(p.id));
  const candidatos = foraDoDisparo.length ? foraDoDisparo : lista;

  const semRodada = candidatos.filter(p => !hist.produtosRodada.has(p.id));
  if (semRodada.length) return semRodada;

  // Baralho desse subconjunto acabou — libera de novo, mas sem deixar repetir
  // o mesmo item que acabou de ser usado (senão dá repetição seguida bem na
  // hora do reset, ex: ...p3, p3...).
  candidatos.forEach(p => hist.produtosRodada.delete(p.id));
  const semORecente = candidatos.filter(p => p.id !== hist.ultimoProduto);
  return semORecente.length ? semORecente : candidatos;
}

// ─── ESCOLHER PRODUTO INTELIGENTE ────────────────────────────────────────────
function escolherProduto(produtos, hora, diaSemana, nomeGrupo, grupoId, categoriaForcada, usadosNesteCiclo) {
  const ciclo = usadosNesteCiclo || new Set();
  const validos = produtos.filter(p => p.oldPrice && p.price && p.link);
  if (!validos.length) return null;

  const hist = getHistorico(grupoId || nomeGrupo);
  const ehMotoboy = isGrupoMotoboy(nomeGrupo);
  const categorias = getCategoriasPorContexto(hora, diaSemana);

  if (ehMotoboy) {
    const motoboys = semRepetir(validos.filter(p => isMotoboy(p)), hist, ciclo);
    if (motoboys.length) return { produto: motoboys[Math.floor(Math.random() * motoboys.length)], tipo: 'motoboy' };
    const qualquer = semRepetir(validos, hist, ciclo);
    if (qualquer.length) return { produto: qualquer[Math.floor(Math.random() * qualquer.length)], tipo: 'motoboy' };
  }

  if (categoriaForcada) {
    const porCategoria = semRepetir(validos.filter(p => produtoMatchCategoria(p, [], categoriaForcada)), hist, ciclo);
    if (porCategoria.length) return { produto: porCategoria[Math.floor(Math.random() * porCategoria.length)], tipo: 'geral' };
  }

  const porHorario = semRepetir(validos.filter(p => produtoMatchCategoria(p, categorias, null)), hist, ciclo);
  if (porHorario.length) return { produto: porHorario[Math.floor(Math.random() * porHorario.length)], tipo: 'geral' };

  const disponiveis = semRepetir(validos, hist, ciclo);
  return { produto: disponiveis[Math.floor(Math.random() * disponiveis.length)], tipo: 'geral' };
}

// ─── ESCOLHER COPY SEM REPETIR (round-robin por tipo geral/motoboy) ────────
function escolherCopy(copys, grupoId, tipo) {
  const hist = getHistorico(grupoId);
  const rodada = hist.copysRodada[tipo];
  let disponiveis = copys.map((_, i) => i).filter(i => !rodada.has(i));
  if (!disponiveis.length) {
    rodada.clear(); // baralho de copys acabou, libera de novo
    const ultima = hist.ultimaCopy[tipo];
    const semARecente = copys.map((_, i) => i).filter(i => i !== ultima);
    disponiveis = semARecente.length ? semARecente : copys.map((_, i) => i);
  }
  const idx = disponiveis[Math.floor(Math.random() * disponiveis.length)];
  rodada.add(idx);
  hist.ultimaCopy[tipo] = idx;
  return idx;
}

// ─── GERAR MENSAGEM ───────────────────────────────────────────────────────────
function gerarMensagem(produto, tipo, grupoId, hora) {
  const desconto = calcularDesconto(produto.oldPrice, produto.price);
  const precoAtual = parseFloat(String(produto.price).replace(',', '.')).toFixed(2).replace('.', ',');
  const precoAntigo = parseFloat(String(produto.oldPrice).replace(',', '.')).toFixed(2).replace('.', ',');
  const descontoTag = desconto > 0 ? ` (${desconto}% OFF)` : '';

  const copys = tipo === 'motoboy' ? COPYS_MOTOBOY : COPYS_GERAIS;
  const tipoCopy = tipo === 'motoboy' ? 'motoboy' : 'geral';
  const idx = escolherCopy(copys, grupoId, tipoCopy);

  registrarUso(grupoId, produto.id); // marca produto e persiste (produto + copy juntos, já marcados acima)

  const mensagem = copys[idx]
    .replace(/{SAUDACAO}/g, getSaudacao(hora))
    .replace(/{NOME}/g, produto.name)
    .replace(/{PRECO_ANTIGO}/g, precoAntigo)
    .replace(/{PRECO_ATUAL}/g, precoAtual)
    .replace(/{DESCONTO_TAG}/g, descontoTag)
    .replace(/{LINK}/g, produto.link);

  return { mensagem, imageUrl: produto.imageUrl || null, produto: produto.name, produtoId: produto.id, desconto };
}

// ─── FUNÇÃO PRINCIPAL ───────────────────────────────────────────────────────
function gerarParaGrupo(produtos, hora, nomeGrupo, grupoId, categoriaForcada, usadosNesteCiclo) {
  const agora = new Date();
  const diaSemana = agora.getDay();

  const resultado = escolherProduto(produtos, hora, diaSemana, nomeGrupo, grupoId, categoriaForcada, usadosNesteCiclo);
  if (!resultado) {
    console.log('⚠️  Agente: Sem produtos válidos. Cadastre produtos com preço antigo e atual!');
    return null;
  }

  const msg = gerarMensagem(resultado.produto, resultado.tipo, grupoId, hora);
  if (usadosNesteCiclo) usadosNesteCiclo.add(msg.produtoId);

  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  console.log(`🧠 Agente → Grupo: "${nomeGrupo}"`);
  console.log(`   📦 Produto: ${msg.produto}`);
  console.log(`   💰 Desconto: ${msg.desconto}%`);
  console.log(`   🏷️  Tipo copy: ${resultado.tipo}`);
  console.log(`   🕐 ${hora}h | ${dias[diaSemana]}${categoriaForcada ? ` | Categoria: ${categoriaForcada}` : ''}`);

  return msg;
}

// Mantém compatibilidade com versão anterior
function gerarParaHorario(produtos, hora, nomeGrupo) {
  return gerarParaGrupo(produtos, hora, nomeGrupo || '', nomeGrupo || '', null, null);
}

export { gerarParaGrupo, gerarParaHorario, calcularDesconto };
