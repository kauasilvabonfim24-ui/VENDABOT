// ╔══════════════════════════════════════════════════════════════╗
// ║   AGENTE IA KAUÃ v4 — Inteligente, sem repetição             ║
// ║   (corrigido: match de categoria ignora acento + diversifica ║
// ║    produto entre grupos diferentes no mesmo disparo)         ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── NORMALIZAÇÃO DE TEXTO (ignora acento/maiúsculas na comparação) ─────────
// Antes, comparávamos texto acentuado ("Relógio", "Sandália") contra
// palavras-chave sem acento ("relogio", "sandalia") e a maioria não batia —
// isso fazia sobrar só 1 produto "por sorte" em várias faixas de horário, e
// esse único produto acabava sendo mandado pra TODOS os grupos naquele
// disparo. Normalizando os dois lados (removendo acento e caixa) antes de
// comparar, o match fica correto de verdade.
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

// ─── COPYS GERAIS (10 modelos) ───────────────────────────────────────────────
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
  `🌟 *OFERTA DO MOMENTO* 🌟\n📦 *{NOME}*\n💵 De: ~~R$ {PRECO_ANTIGO}~~\n🔥 Agora por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🚀 Aproveite a promoção.\n👉 {LINK}`
];

// ─── COPYS MOTOBOY (6 modelos) ───────────────────────────────────────────────
const COPYS_MOTOBOY = [
  `🏍️ *ACHADO PARA MOTOCA!* 🏍️\n🔥 *{NOME}*\n💰 De: ~~R$ {PRECO_ANTIGO}~~\n✅ Por apenas: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Produto aprovado pelos irmãos do asfalto!\n👉 Confira:\n{LINK}`,
  `🛵 *PROMOÇÃO PRA QUEM TÁ NA RODA!* 🛵\n📦 *{NOME}*\n❌ ~~R$ {PRECO_ANTIGO}~~\n💥 Agora por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Essencial pra quem vive de moto!\n👉 {LINK}`,
  `🚨 *ATENÇÃO MOTOBOYS!* 🚨\n📢 Oferta imperdível chegou!\n🏍️ *{NOME}*\n💸 De: ~~R$ {PRECO_ANTIGO}~~\n💚 Por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⏳ Corre que é por tempo limitado!\n👉 {LINK}`,
  `⚡ *OFERTA RELÂMPAGO PARA MOTOCA!* ⚡\n🛵 *{NOME}*\n💰 De ~~R$ {PRECO_ANTIGO}~~\n🔥 Por *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🏍️ Perfeito pra quem roda todo dia!\n👉 {LINK}`,
  `🔥 *OLHA ESSE ACHADO, MOTOCA!*\n📦 *{NOME}*\n💵 ~~R$ {PRECO_ANTIGO}~~ ➜ *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n🛵 Quem é da vida não pode perder!\n⏳ Aproveite enquanto tem!\n👉 {LINK}`,
  `🪖 *EQUIPAMENTO BOM E BARATO!* 🪖\n🏍️ *{NOME}*\n❌ De: ~~R$ {PRECO_ANTIGO}~~\n✅ Hoje por: *R$ {PRECO_ATUAL}*{DESCONTO_TAG}\n⚡ Segurança e economia andam juntas!\n👉 {LINK}`
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
  // Dia especial tem prioridade
  if (DIAS_SEMANA[diaSemana]) return DIAS_SEMANA[diaSemana];
  // Por horário
  for (const [, v] of Object.entries(HORARIOS)) {
    if (hora >= v.min && hora < v.max) return v.cats;
  }
  return SEMPRE_CONVERTE;
}

function produtoMatchCategoria(produto, categorias, categoriaForcada) {
  const texto = normalizar((produto.category || '') + ' ' + (produto.name || ''));
  // Se tem categoria forçada no agendamento, usa ela
  if (categoriaForcada) return texto.includes(normalizar(categoriaForcada));
  // Senão usa categorias do horário
  return categorias.some(c => texto.includes(normalizar(c)));
}

// Dado um array de produtos já filtrados por uma regra (motoboy, categoria,
// etc), tenta primeiro achar um que NÃO tenha sido usado nem no histórico
// recente do grupo (últimos 3) nem já usado NESSE MESMO disparo (outros
// grupos que já receberam mensagem agora há pouco, no mesmo ciclo do
// agendamento). Se não sobrar nenhum com essa restrição dupla, relaxa pro
// histórico do grupo (mantém só a regra de não repetir dentro do mesmo
// disparo). Se ainda assim não sobrar nada (ex: só existe 1 produto válido no
// total), aí sim permite repetir — não tem outra opção.
function semRepetir(lista, hist, usadosNesteCiclo) {
  if (!lista.length) return lista;
  const semNadaRepetido = lista.filter(p => !usadosNesteCiclo.has(p.id) && !hist.produtos.slice(-3).includes(p.id));
  if (semNadaRepetido.length) return semNadaRepetido;
  const soSemRepetirNesteCiclo = lista.filter(p => !usadosNesteCiclo.has(p.id));
  if (soSemRepetirNesteCiclo.length) return soSemRepetirNesteCiclo;
  return lista; // não tem jeito, só sobrou repetir
}

// ─── ESCOLHER PRODUTO INTELIGENTE ────────────────────────────────────────────
// usadosNesteCiclo: Set com os IDs de produto já escolhidos nesse MESMO disparo
// (mesmo horário, passando por vários grupos em sequência) — evita que todos
// os grupos recebam o mesmo produto só porque, individualmente, cada grupo
// "achava" que aquele produto tava livre no histórico dele.
function escolherProduto(produtos, hora, diaSemana, nomeGrupo, grupoId, categoriaForcada, usadosNesteCiclo) {
  const ciclo = usadosNesteCiclo || new Set();
  const validos = produtos.filter(p => p.oldPrice && p.price && p.link);
  if (!validos.length) return null;

  const hist = getHistorico(grupoId || nomeGrupo);
  const ehMotoboy = isGrupoMotoboy(nomeGrupo);
  const categorias = getCategoriasPorContexto(hora, diaSemana);

  // 1. Grupo motoboy → só produto motoboy
  if (ehMotoboy) {
    const motoboys = semRepetir(validos.filter(p => isMotoboy(p)), hist, ciclo);
    if (motoboys.length) return { produto: motoboys[Math.floor(Math.random() * motoboys.length)], tipo: 'motoboy' };
    // Se não tem produto motoboy, avisa (mas ainda assim tenta não repetir)
    const qualquer = semRepetir(validos, hist, ciclo);
    if (qualquer.length) return { produto: qualquer[Math.floor(Math.random() * qualquer.length)], tipo: 'motoboy' };
  }

  // 2. Categoria forçada pelo agendamento
  if (categoriaForcada) {
    const porCategoria = semRepetir(validos.filter(p => produtoMatchCategoria(p, [], categoriaForcada)), hist, ciclo);
    if (porCategoria.length) return { produto: porCategoria[Math.floor(Math.random() * porCategoria.length)], tipo: 'geral' };
  }

  // 3. Categoria certa pro horário/dia
  const porHorario = semRepetir(validos.filter(p => produtoMatchCategoria(p, categorias, null)), hist, ciclo);
  if (porHorario.length) return { produto: porHorario[Math.floor(Math.random() * porHorario.length)], tipo: 'geral' };

  // 4. Qualquer produto não repetido
  const disponiveis = semRepetir(validos, hist, ciclo);
  return { produto: disponiveis[Math.floor(Math.random() * disponiveis.length)], tipo: 'geral' };
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
function gerarMensagem(produto, tipo, grupoId, hora) {
  const desconto = calcularDesconto(produto.oldPrice, produto.price);
  const precoAtual = parseFloat(String(produto.price).replace(',', '.')).toFixed(2).replace('.', ',');
  const precoAntigo = parseFloat(String(produto.oldPrice).replace(',', '.')).toFixed(2).replace('.', ',');
  const descontoTag = desconto > 0 ? ` (${desconto}% OFF)` : '';

  const copys = tipo === 'motoboy' ? COPYS_MOTOBOY : COPYS_GERAIS;
  const idx = escolherCopy(copys, grupoId);

  registrarUso(grupoId, produto.id, idx);

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
// usadosNesteCiclo (opcional): Set compartilhado entre as chamadas dessa
// função dentro do MESMO disparo (o bot.js cria um Set novo a cada horário
// agendado e reaproveita ele pra cada grupo daquela rodada).
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
