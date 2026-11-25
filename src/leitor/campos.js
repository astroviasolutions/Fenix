/* Vocabulário do leitor: como cada parceiro chama cada campo, e como limpar o que vem sujo. */

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* "AndrÃ© oku" → "André oku": texto UTF-8 que passou por Latin-1 em algum sistema do parceiro. */
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
export function consertaTexto(s) {
  s = String(s ?? '');
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const b = [];
    for (const ch of s) { const c = ch.codePointAt(0); if (c < 256) b.push(c); else if (CP1252[c]) b.push(CP1252[c]); else return s; }
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(b));
  } catch { return s; }
}

export const limpa = (s) => consertaTexto(s).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

/* Campo → [expressão do rótulo (já sem acento/minúscula), prioridade: menor ganha quando há dois candidatos] */
export const CAMPOS = [
  ['codigo', /\b(awb|rastre\w*|tracking|etiqueta|etiq|barcode|waybill|codigo de barras|entrega n|ctrc)\b/, 1],
  ['codigo', /numero de pacote|n\w? ?de pacote|pacote|volume id/, 2],
  ['codigo', /^(codigo|cod|id)$/, 3],
  ['codigo', /\bpedido\b/, 6],
  ['cep', /^(cep|codigo postal)$/, 1],
  ['telefone', /\b(telefones?|fone|phone|celular|contato|tel)\b/, 1],
  ['cliente', /\b(destinat\w*|consignee|recebedor|receiver|cliente|nome)\b/, 1],
  ['endereco', /\b(endereco|address|logradouro|end entrega|rua)\b/, 1],
  ['numero', /^(numero da casa|numero|num|nro|n)$/, 1],
  ['bairro', /\b(bairro|district)\b/, 1],
  ['cidade', /\b(cidade|city|municipio)\b/, 1],
  ['remetente', /\b(embarcador|remetente|shipper|filial|loja|origem)\b/, 1],
  ['servico', /^(serv|servico|modalidade)$/, 1],
  ['tipo', /^(tipo|tipo servico)$/, 1],
  ['peso', /\b(peso|kg|kgrea)\b/, 1],
  ['nf', /\b(nota fiscal|nfiscal|nf|nfe)\b/, 1],
  ['entregador', /\b(entregador|motorista|courier|driver)\b/, 1],
];
export const ROTULOS = {
  codigo: 'Código / etiqueta', cliente: 'Destinatário', endereco: 'Endereço', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade', cep: 'CEP',
  telefone: 'Telefone', remetente: 'Remetente', servico: 'Serviço', tipo: 'Tipo', peso: 'Peso', nf: 'Nota fiscal', entregador: 'Entregador',
};
export function campoDoRotulo(rotulo) {
  const t = norm(rotulo);
  if (!t) return null;
  let melhor = null;
  for (const [campo, rx, pri] of CAMPOS) if (rx.test(t) && (!melhor || pri < melhor[1])) melhor = [campo, pri];
  return melhor;
}

/* ---------- normalização de valores ---------- */
export const cepFmt = (v) => { const m = String(v ?? '').match(/(\d{5})-?(\d{3})/); return m ? `${m[1]}-${m[2]}` : ''; };
export const telFmt = (v) => { const d = String(v ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? d : ''; };
export const pesoNum = (v) => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const UFS = /^(parana|santa catarina|sao paulo|rio grande do sul|minas gerais|rio de janeiro|[a-z]{2})$/;
/* Endereço no formato "Paraná,Palmeira,Centro,rua x 164 casa,84130-000" → separa estado/cidade/bairro/rua. */
export function desmembraEndereco(txt) {
  const t = limpa(txt);
  const p = t.split(',').map((x) => x.trim());
  if (p.length >= 4 && UFS.test(norm(p[0]))) {
    const cep = cepFmt(p[p.length - 1]);
    const resto = p.slice(3, cep ? -1 : undefined).join(', ');
    return { cidade: p[1], bairro: p[2], endereco: resto, cep };
  }
  /* "Rua X, 1098 / Centro" (Total Express): o que vem depois da barra é o bairro */
  const b = t.match(/^(.+?)\s+\/\s+([^/]+)$/);
  if (b) return { endereco: b[1].trim(), bairro: b[2].trim(), cep: cepFmt(t) };
  return { endereco: t, cep: cepFmt(t) };
}

/* Detecta o que uma coluna "é" olhando os valores (quando o rótulo é ilegível, como "odor" no lugar de "Destinatário"). */
export function campoPeloConteudo(valores) {
  const v = valores.map((x) => limpa(x)).filter(Boolean);
  if (v.length < 1) return null;
  const frac = (rx) => v.filter((x) => rx.test(x)).length / v.length;
  if (frac(/^\d{5}-?\d{3}$/) >= 0.7) return 'cep';
  if (frac(/^(\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/) >= 0.7) return 'telefone';
  if (frac(/^(rua|r\.|av|avenida|travessa|tv|alameda|estrada|rodovia|praca|praça|al\.)\b/i) >= 0.5) return 'endereco';
  if (new Set(v).size === v.length && frac(/^[A-Za-z0-9-]{8,}$/) >= 0.8 && frac(/\d/) >= 0.8) return 'codigo';
  if (frac(/^[A-Za-zÀ-ÿ.' ]{3,60}$/) >= 0.8 && v.every((x) => x.split(' ').length <= 6)) return 'cliente';
  return null;
}

/* ---------- grafia correta ---------- */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'com']);
const ROMANOS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii', 'xiii']);
const ABREV = [[/^r\.?(?=\s)/i, 'Rua'], [/^av\.?(?=\s)/i, 'Avenida'], [/^tv\.?(?=\s)/i, 'Travessa'], [/^al\.?(?=\s)/i, 'Alameda'], [/^p[cç]a\.?(?=\s)/i, 'Praça'], [/^rod\.?(?=\s)/i, 'Rodovia'], [/^estr\.?(?=\s)/i, 'Estrada']];

/* "RUA DOUTOR JORGE XAVIER DA SILVA" / "rua doutor jorge" → "Rua Doutor Jorge Xavier da Silva".
   Texto que já vem misturado (maiúsculas e minúsculas) é respeitado. */
export function tituloBR(s, { endereco = false } = {}) {
  let t = limpa(s);
  if (!t) return t;
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const misturado = letras && letras !== letras.toUpperCase() && letras !== letras.toLowerCase();
  if (endereco) for (const [rx, nome] of ABREV) if (rx.test(t)) { t = t.replace(rx, nome); break; }
  /* já misturado ("Rua Treze De Maio", "Dom Pedro Ii"): só acerta partículas e algarismos romanos */
  if (misturado) return t.replace(/[^\s/(),.-]+/g, (w, i) => (i > 0 && PARTICULAS.has(w.toLowerCase()) ? w.toLowerCase() : ROMANOS.has(w.toLowerCase()) ? w.toUpperCase() : w));
  return t.toLowerCase().replace(/[^\s/(),.-]+/g, (w, i) => {
    if (i > 0 && PARTICULAS.has(w)) return w;
    if (ROMANOS.has(w)) return w.toUpperCase();
    if (/^[a-z]\/[a-z]$/.test(w)) return w.toUpperCase(); // S/N
    return w.replace(/(^|['’])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase());
  });
}

/* Grafia certa (com acento) das cidades da região; as que já existem no sistema entram na frente. */
export const CIDADES_PR = ['Castro', 'Carambeí', 'Piraí do Sul', 'Palmeira', 'Ponta Grossa', 'Tibagi', 'Arapoti', 'Jaguariaíva', 'Ipiranga', 'Telêmaco Borba', 'Ortigueira', 'Imbaú', 'Sengés', 'Reserva', 'Curitiba', 'São José dos Pinhais', 'Araucária', 'Londrina', 'Maringá', 'Cascavel', 'Guarapuava', 'Paranaguá', 'Foz do Iguaçu', 'Campo Largo', 'Colombo', 'Pinhais', 'Fazenda Rio Grande', 'Lapa', 'Contenda', 'Quitandinha'];

const UF_VALIDAS = new Set('ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to rp'.split(' '));
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/* "castro", "CASTRO", "Castro-PR", "Castro/PR", "Castro - Pr" → { cidade: 'Castro', uf: 'PR' }.
   `conhecidas`: grafias já usadas no sistema; a grafia certa é a mais completa/acentuada entre elas. */
export function cidadeCanon(txt, conhecidasExtra = []) {
  const conhecidas = [...conhecidasExtra, ...CIDADES_PR];
  let t = limpa(txt);
  if (!t) return { cidade: '', uf: '' };
  let uf = '';
  const m = t.match(/^(.*?\S)\s*[\s/,\-–(]+\s*([A-Za-z]{2})\)?$/);
  if (m && UF_VALIDAS.has(m[2].toLowerCase())) { t = m[1]; uf = m[2].toUpperCase() === 'RP' ? 'PR' : m[2].toUpperCase(); } // "RP" é erro de digitação de PR
  const nome = tituloBR(t);
  const k = norm(nome);
  const igual = conhecidas.find((c) => norm(c) === k);
  if (igual) return { cidade: igual, uf };
  if (k.length >= 6) {
    const perto = conhecidas.find((c) => norm(c)[0] === k[0] && Math.abs(norm(c).length - k.length) <= 1 && lev(norm(c), k) === 1);
    if (perto) return { cidade: perto, uf };
  }
  return { cidade: nome, uf };
}

/* Unifica a grafia das cidades de uma lista de registros (e das já cadastradas): a forma mais frequente/acentuada vence. */
export function unificarCidades(registros, jaUsadas = []) {
  const cont = new Map();
  for (const r of registros) { const c = cidadeCanon(r.cidade).cidade; if (c) cont.set(c, (cont.get(c) || 0) + 1); }
  const ordem = [...new Set([...jaUsadas.map((c) => cidadeCanon(c).cidade),  ...[...cont.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])])].filter(Boolean);
  return registros.map((r) => { if (!r.cidade) return r; const { cidade, uf } = cidadeCanon(r.cidade, ordem); return { ...r, cidade, uf: uf || r.uf || '' }; });
}
