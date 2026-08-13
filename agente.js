// ╔══════════════════════════════════════════════════════════════╗
// ║   AGENTE IA KAUÃ v3 — Inteligente, sem repetição           ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── COPYS GERAIS (10 modelos) ───────────────────────────────────────────────
const COPYS_GERAIS = [
  `🌞 *BOM DIA! TEM OFERTA BOA HOJE!* 🌞\n🔥 *{NOME}* 🔥\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por apenas: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ Aproveite enquanto a promoção estiver disponível.\n👉 Confira aqui:\n{LINK}`,
  `🚨 *ACHADO DO DIA!* 🚨\n👀 Encontrei essa promoção e vim compartilhar!\n📦 *{NOME}*\n❌ De: ~~R$ {PRECO_ANTIGO}~~\n💥 Hoje por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👉 Veja antes que o preço mude:\n{LINK}`,
  `☀️ *BOM DIA, PESSOAL!*\n🔥 Promoção disponível!\n📦 *{NOME}*\n💰 ~~R$ {PRECO_ANTIGO}~~\n✅ Agora por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Vale a pena conferir.\n👉 {LINK}`,
  `🎁 *OFERTA ESPECIAL DO DIA* 🎁\n🔥 *{NOME}*\n💸 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Aproveite enquanto durar.\n👉 {LINK}`,
  `🚀 *PROMOÇÃO LIBERADA!*\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n🔥 Por apenas *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ O preço pode mudar a qualquer momento.\n👉 {LINK}`,
  `💥 *SUPER OFERTA!* 💥\n🛍️ *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n✅ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Dá uma olhada nessa promoção.\n👉 {LINK}`,
  `📢 *PROMOÇÃO RELÂMPAGO!*\n🔥 *{NOME}*\n💲 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Agora: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚠️ Aproveite enquanto o desconto estiver ativo.\n👉 {LINK}`,
  `🎯 *OFERTA QUE VALE A PENA!*\n📦 *{NOME}*\n💸 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n✨ Excelente oportunidade.\n👉 {LINK}`,
  `🔥 *CORRE QUE BAIXOU!*\n📦 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n✅ Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n👀 Confere aí!\n👉 {LINK}`,
  `🌟 *OFERTA DO MOMENTO* 🌟\n📦 *{NOME}*\n💵 De: ~~R$ {PRECO_ANTIGO}~~\n🔥 Agora por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🚀 Aproveite a promoção.\n👉 {LINK}`
];

// ─── COPYS MOTOBOY (6 modelos) ───────────────────────────────────────────────
const COPYS_MOTOBOY = [
  `🏍️ *ACHADO PARA MOTOCA!* 🏍️\n🔥 *{NOME}*\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por apenas: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Produto aprovado pelos irmãos do asfalto!\n👉 Confira aqui:\n{LINK}`,
  `🛵 *PROMOÇÃO PRA QUEM TÁ NA RODA!* 🛵\n📦 *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n💥 Agora por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Essencial pra quem vive de moto!\n👉 {LINK}`,
  `🚨 *ATENÇÃO MOTOBOYS!* 🚨\n📢 Oferta imperdível chegou!\n🏍️ *{NOME}*\n💸 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ Corre que é por tempo limitado!\n👉 {LINK}`,
  `⚡ *OFERTA RELÂMPAGO PARA MOTOCA!* ⚡\n🛵 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n🔥 Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Perfeito pra quem roda todo dia!\n👉 {LINK}`,
  `🔥 *OLHA ESSE ACHADO, MOTOCA!*\n📦 *{NOME}*\n💵 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🛵 Quem é da vida não pode perder!\n⏳ Aproveite enquanto tem!\n👉 {LINK}`,
  `🪖 *EQUIPAMENTO BOM E BARATO!* 🪖\n🏍️ *{NOME}*\n❌ De: ~~R$ {PRECO_ANTIGO}~~\n✅ Hoje por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Segurança e economia andam juntas!\n👉 {LINK}`
];

// ─── CATEGORIAS POR HORÁRIO ──────────────────────────────────────────────────
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

const SEMPRE_CONVERTE = ['air fryer','robo aspirador','smartwatch','fone bluetooth','carregador','power bank','tenis','perfume','bolsa','mochila','kit ferramentas','caixa de som','impressora','projetor','aspirador','escova secadora','skincare','panela','camera seguranca'];

// ─── HISTÓRICO POR GRUPO (evita repetição) ──────────────────────────────────
const historicoPorGrupo = {}; // { grupoId: { produtos: [], copys: [] } }

function getHistorico(grupoId) {
  if (!historicoPorGrupo[grupoId]) historicoPorGrupo[grupoId] = { produtos: [], copys: [] };
  return historicoPorGrupo[grupoId];
}

function registrarUso(grupoId, produtoId, copyIdx) {
  const h = getHistorico(grupoId);
  h.produtos.push(produtoId);
  h.copys.push(copyIdx);
  if (h.produtos.length > 10) h.produtos = h.produtos.slice(-10);
  if (h.copys.length > 10) h.copys = h.copys.slice(-10);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function calcularDesconto(precoAntigo, precoAtual) {
  const a = parseFloat(String(precoAntigo).replace(',', '.'));
  const b = parseFloat(String(precoAtual).replace(',', '.'));
  if (!a || !b || a <= b) return 0;
  return Math.round(((a - b) / a) * 100);
}

function isMotoboy(produto) {
  const palavras = ['motoboy','moto','delivery','capacete','luva','jaqueta','bag delivery','suporte celular','capa chuva','bota moto','cadeado moto','farol','buzina','retrovisor'];
  const texto = ((produto.category || '') + ' ' + (produto.name || '')).toLowerCase();
  return palavras.some(c => texto.includes(c));
}

function isGrupoMotoboy(nomeGrupo) {
  const palavras = ['motoboy','moto','delivery','motoca','piloto','rider','capacete'];
  return palavras.some(p => (nomeGrupo || '').toLowerCase().includes(p));
}

function getCategoriasPorContexto(hora, diaSemana) {
  // Dia especial tem prioridade
  if (DIAS_SEMANA[diaSemana]) return DIAS_SEMANA[diaSemana];
  // Por horário
  for (const [, v] of Object.entries(HORARIOS)) {
    if (hora >= v.min && hora < v.max) return v.cats;
  }
  return SEMPRE_CONVERTE;
}

function produtoMatchCategoria(produto, categorias, categoriaForcada) {
  const texto = ((produto.category || '') + ' ' + (produto.name || '')).toLowerCase();
  // Se tem categoria forçada no agendamento, usa ela
  if (categoriaForcada) return texto.includes(categoriaForcada.toLowerCase());
  // Senão usa categorias do horário
  return categorias.some(c => texto.includes(c));
}

// ─── ESCOLHER PRODUTO INTELIGENTE ────────────────────────────────────────────
function escolherProduto(produtos, hora, diaSemana, nomeGrupo, grupoId, categoriaForcada) {
  const validos = produtos.filter(p => p.oldPrice && p.price && p.link);
  if (!validos.length) return null;

  const hist = getHistorico(grupoId || nomeGrupo);
  const ehMotoboy = isGrupoMotoboy(nomeGrupo);
  const categorias = getCategoriasPorContexto(hora, diaSemana);

  // 1. Grupo motoboy → só produto motoboy
  if (ehMotoboy) {
    const motoboys = validos.filter(p => isMotoboy(p) && !hist.produtos.slice(-3).includes(p.id));
    if (motoboys.length) return { produto: motoboys[Math.floor(Math.random() * motoboys.length)], tipo: 'motoboy' };
    // Se não tem produto motoboy, avisa
    const qualquer = validos.filter(p => !hist.produtos.slice(-3).includes(p.id));
    if (qualquer.length) return { produto: qualquer[Math.floor(Math.random() * qualquer.length)], tipo: 'motoboy' };
  }

  // 2. Categoria forçada pelo agendamento
  if (categoriaForcada) {
    const porCategoria = validos.filter(p => produtoMatchCategoria(p, [], categoriaForcada) && !hist.produtos.slice(-3).includes(p.id));
    if (porCategoria.length) return { produto: porCategoria[Math.floor(Math.random() * porCategoria.length)], tipo: 'geral' };
  }

  // 3. Categoria certa pro horário/dia
  const porHorario = validos.filter(p => produtoMatchCategoria(p, categorias, null) && !hist.produtos.slice(-3).includes(p.id));
  if (porHorario.length) return { produto: porHorario[Math.floor(Math.random() * porHorario.length)], tipo: 'geral' };

  // 4. Qualquer produto não repetido
  const disponiveis = validos.filter(p => !hist.produtos.slice(-3).includes(p.id));
  const lista = disponiveis.length ? disponiveis : validos;
  return { produto: lista[Math.floor(Math.random() * lista.length)], tipo: 'geral' };
}

// ─── ESCOLHER COPY SEM REPETIR ────────────────────────────────────────────────
function escolherCopy(copys, grupoId) {
  const hist = getHistorico(grupoId);
  const ultimasCopys = hist.copys.slice(-3);
  let idx;
  let tentativas = 0;
  do {
    idx = Math.floor(Math.random() * copys.length);
    tentativas++;
  } while (ultimasCopys.includes(idx) && tentativas < 20);
  return idx;
}

// ─── GERAR MENSAGEM ───────────────────────────────────────────────────────────
function gerarMensagem(produto, tipo, grupoId) {
  const desconto = calcularDesconto(produto.oldPrice, produto.price);
  const precoAtual = parseFloat(String(produto.price).replace(',', '.')).toFixed(2).replace('.', ',');
  const precoAntigo = parseFloat(String(produto.oldPrice).replace(',', '.')).toFixed(2).replace('.', ',');
  const descontoTag = desconto > 0 ? ` (${desconto}% OFF)` : '';

  const copys = tipo === 'motoboy' ? COPYS_MOTOBOY : COPYS_GERAIS;
  const idx = escolherCopy(copys, grupoId);

  registrarUso(grupoId, produto.id, idx);

  const mensagem = copys[idx]
    .replace(/{NOME}/g, produto.name)
    .replace(/{PRECO_ANTIGO}/g, precoAntigo)
    .replace(/{PRECO_ATUAL}/g, precoAtual)
    .replace(/{DESCONTO_TAG}/g, descontoTag)
    .replace(/{LINK}/g, produto.link);

  return { mensagem, imageUrl: produto.imageUrl || null, produto: produto.name, desconto };
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────
function gerarParaGrupo(produtos, hora, nomeGrupo, grupoId, categoriaForcada) {
  const agora = new Date();
  const diaSemana = agora.getDay();

  const resultado = escolherProduto(produtos, hora, diaSemana, nomeGrupo, grupoId, categoriaForcada);
  if (!resultado) {
    console.log('⚠️  Agente: Sem produtos válidos. Cadastre produtos com preço antigo e atual!');
    return null;
  }

  const msg = gerarMensagem(resultado.produto, resultado.tipo, grupoId);

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
  return gerarParaGrupo(produtos, hora, nomeGrupo || '', nomeGrupo || '', null);
}

module.exports = { gerarParaGrupo, gerarParaHorario, calcularDesconto };
