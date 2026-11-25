import { campoDoRotulo, campoPeloConteudo, cepFmt, cidadeCanon, desmembraEndereco, limpa, norm, pesoNum, telFmt, tituloBR } from './campos.js';
import { agruparLinhas, juntaTexto } from './pdf.js';

/*
  Leitor de TABELAS em PDF, sem depender de um layout fixo.
  1) acha a linha de cabeçalho (a que mais parece rótulos conhecidos) e junta cabeçalhos de várias linhas;
  2) cada coluna é a faixa horizontal do rótulo; cada item de texto cai na coluna que ele cobre;
  3) as linhas (registros) são ancoradas na coluna de numeração 1,2,3…: cada item vai para a âncora mais próxima
     na vertical. Isso resolve células quebradas em várias linhas e texto centralizado na linha (Anjun, !Mile).
*/
const sobrepoe = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const caixa = (it) => ({ x0: it.x, x1: it.x + Math.max(it.w, 4) });

function acharCabecalho(linhas) {
  let melhor = null;
  for (const l of linhas) {
    const campos = new Set(l.itens.map((i) => campoDoRotulo(i.t)?.[0]).filter(Boolean));
    const rotulos = l.itens.filter((i) => campoDoRotulo(i.t)).length;
    const score = campos.size * 10 + rotulos;
    if (campos.size >= 2 && (!melhor || score > melhor.score)) melhor = { l, score };
  }
  return melhor?.l || null;
}

/* Colunas = rótulos do cabeçalho; rótulos empilhados (ex.: "Número" / "da casa") formam uma coluna só. */
function colunasDoCabecalho(itensPagina, cab) {
  const perto = itensPagina.filter((i) => Math.abs(i.y - cab.y) <= 16);
  const principal = perto.filter((i) => Math.abs(i.y - cab.y) <= 3);
  const outros = perto.filter((i) => !principal.includes(i));
  const ov = (a, b) => sobrepoe(caixa(a), caixa(b)) > 0.3 * Math.min(Math.max(a.w, 4), Math.max(b.w, 4));
  /* rótulo de 2 linhas ("Número" / "da casa") fica; caixinhas soltas acima do cabeçalho ("CARDS 0") não */
  const zona = [...principal, ...outros.filter((o) => principal.some((p) => ov(o, p)) || outros.some((q) => q !== o && Math.abs(q.y - o.y) > 3 && ov(o, q)))];
  const cols = [];
  for (const it of [...zona].sort((a, b) => a.x - b.x)) {
    const b = caixa(it);
    const c = cols.find((k) => sobrepoe(k, b) > 0.3 * Math.min(k.x1 - k.x0, b.x1 - b.x0) && !k.itens.some((j) => Math.abs(j.y - it.y) <= 3));
    if (c) { c.itens.push(it); c.x0 = Math.min(c.x0, b.x0); c.x1 = Math.max(c.x1, b.x1); }
    else cols.push({ ...b, itens: [it] });
  }
  for (const c of cols) c.rotulo = juntaTexto(c.itens);
  return cols.sort((a, b) => a.x0 - b.x0);
}

function colunaDoItem(cols, it) {
  const b = caixa(it);
  let melhor = -1, ov = 0;
  cols.forEach((c, i) => { const o = sobrepoe(c, b); if (o > ov) { ov = o; melhor = i; } });
  if (melhor >= 0) return melhor;
  const cx = (b.x0 + b.x1) / 2;
  let d = Infinity;
  cols.forEach((c, i) => { const dd = Math.abs((c.x0 + c.x1) / 2 - cx); if (dd < d) { d = dd; melhor = i; } });
  return melhor;
}

/* âncoras: coluna cujos valores são 1,2,3… (continuando a numeração da página anterior) */
function acharAncoras(dados, cols, inicio) {
  let melhor = null;
  cols.forEach((_, ci) => {
    const ints = dados.filter((i) => i.col === ci && /^\d{1,4}$/.test(i.t)).sort((a, b) => b.y - a.y);
    if (!ints.length) return;
    let esperado = inicio, seq = [];
    for (const it of ints) { if (Number(it.t) === esperado) { seq.push(it); esperado++; } }
    if (seq.length && (!melhor || seq.length > melhor.seq.length)) melhor = { ci, seq };
  });
  return melhor;
}

export function lerTabelaPdf(paginas, mapaManual = null) {
  const registros = [], avisos = [];
  let proximo = 1, colunasInfo = null, ultimaPag = 0;
  for (const pg of paginas) {
    const linhas = agruparLinhas(pg.itens);
    const cab = acharCabecalho(linhas);
    if (!cab) continue;
    const cols = colunasDoCabecalho(pg.itens, cab);
    const noCab = new Set(cols.flatMap((c) => c.itens));
    const fundoCab = Math.min(...[...noCab].map((i) => i.y));
    let dados = pg.itens.filter((i) => i.y < cab.y - 2 && i.y < fundoCab + 1 && !noCab.has(i) || (i.y < fundoCab - 2 && !noCab.has(i)));
    /* número colado no texto da coluna seguinte ("100 B2C"): separa */
    dados = dados.flatMap((i) => {
      const m = i.x < cols[0].x1 && i.t.match(/^(\d{1,4})\s+(\S.*)$/);
      if (!m) return [i];
      const cw = (i.w || i.t.length * 5) / i.t.length, wn = cw * m[1].length;
      return [{ ...i, t: m[1], w: wn }, { ...i, t: m[2], x: i.x + cw * (m[1].length + 1), w: i.w - cw * (m[1].length + 1) }];
    });
    /* valor numérico colado no fim do texto da coluna anterior ("CWAY100098177TX 0,02" → código + peso) */
    const numericas = cols.filter((c) => ['peso', 'volumes'].includes(campoDoRotulo(c.rotulo)?.[0]));
    dados = dados.flatMap((i) => {
      const m = i.t.match(/^(.+\S)\s+(\d+(?:[.,]\d+)?)$/);
      if (!m || !numericas.length) return [i];
      const cw = (i.w || i.t.length * 5) / i.t.length, xn = i.x + cw * (m[1].length + 1);
      if (!numericas.some((c) => xn >= c.x0 - 6 && xn <= c.x1 + 6 && i.x < c.x0 - 4)) return [i];
      return [{ ...i, t: m[1], w: cw * m[1].length }, { ...i, t: m[2], x: xn, w: cw * m[2].length }];
    });
    dados.forEach((i) => { i.col = colunaDoItem(cols, i); });
    const anc = acharAncoras(dados, cols, proximo);
    if (!anc) continue;
    const ys = anc.seq.map((i) => i.y);
    const passo = ys.length > 1 ? (ys[0] - ys[ys.length - 1]) / (ys.length - 1) : 160;
    const lim = ys.length > 1 ? passo : 160;
    const linhasReg = ys.map(() => ({}));
    for (const it of dados) {
      if (it.col === anc.ci && /^\d{1,4}$/.test(it.t) && anc.seq.includes(it)) continue;
      let k = 0, d = Infinity;
      ys.forEach((y, i) => { const dd = Math.abs(y - it.y); if (dd < d) { d = dd; k = i; } });
      if (d > lim) continue; // rodapé / assinatura
      if (ys.length > 1 && k === ys.length - 1 && it.y < ys[k] && ys[k] - it.y > 0.55 * passo) continue; // "Encarregado / Courier / Data / Hora" logo abaixo da última linha
      (linhasReg[k][it.col] ||= []).push(it);
    }
    colunasInfo = cols;
    linhasReg.forEach((cel, k) => registros.push({ n: Number(anc.seq[k].t), pagina: pg.n, cel }));
    proximo = Number(anc.seq[anc.seq.length - 1].t) + 1;
    ultimaPag = pg.n;
  }
  if (!registros.length || !colunasInfo) return null;

  /* rótulo → campo (com prioridade); colunas sem valor são descartadas; rótulo ilegível cai no palpite pelo conteúdo */
  const ncol = colunasInfo.length;
  const valores = (ci) => registros.map((r) => juntaTexto(r.cel[ci] || [])).filter(Boolean);
  const mapa = {}; // colunaIndex → campo
  const usados = new Set();
  const candidatas = colunasInfo.map((c, ci) => ({ ci, v: valores(ci), r: campoDoRotulo(c.rotulo) })).filter((x) => x.v.length);
  if (mapaManual) Object.entries(mapaManual).forEach(([ci, campo]) => { if (campo) { mapa[ci] = campo; usados.add(campo); } });
  else {
    for (const x of [...candidatas].filter((x) => x.r).sort((a, b) => a.r[1] - b.r[1])) { if (!usados.has(x.r[0])) { mapa[x.ci] = x.r[0]; usados.add(x.r[0]); } }
    for (const x of candidatas) { if (mapa[x.ci]) continue; const c = campoPeloConteudo(x.v); if (c && !usados.has(c)) { mapa[x.ci] = c; usados.add(c); } }
  }
  const lista = registros.map((r) => {
    const o = { _n: r.n, _pagina: r.pagina };
    for (const [ci, campo] of Object.entries(mapa)) o[campo] = juntaTexto(r.cel[ci] || []);
    return o;
  });
  const colunas = colunasInfo.map((c, ci) => ({ indice: ci, rotulo: c.rotulo, campo: mapa[ci] || null, amostra: valores(ci).slice(0, 3) }));
  return { registros: lista.map(finaliza), colunas, ultimoNumero: proximo - 1, paginas: ultimaPag };
}

/* limpeza comum a todos os leitores */
export function finaliza(r) {
  const o = { ...r };
  for (const k of Object.keys(o)) if (typeof o[k] === 'string') o[k] = limpa(o[k]);
  if (o.endereco) {
    const d = desmembraEndereco(o.endereco);
    o.endereco = d.endereco; if (d.cidade && !o.cidade) o.cidade = d.cidade; if (d.bairro && !o.bairro) o.bairro = d.bairro; if (d.cep && !o.cep) o.cep = d.cep;
  }
  if (o.numero && o.endereco && !new RegExp(`\\b${o.numero}\\b`).test(o.endereco)) o.endereco = `${o.endereco}, ${o.numero}`;
  delete o.numero;
  if (o.cep) o.cep = cepFmt(o.cep) || o.cep;
  if (o.telefone) o.telefone = telFmt(o.telefone) || '';
  if (o.cidade) { const c = cidadeCanon(o.cidade); o.cidade = c.texto; if (c.uf) o.uf = c.uf; }
  if (o.endereco) o.endereco = tituloBR(o.endereco, { endereco: true }).replace(/(\s*,)+\s*$/, '').replace(/,(\s*,)+/g, ',');
  if (o.bairro) o.bairro = tituloBR(o.bairro);
  if (o.cliente) o.cliente = tituloBR(o.cliente);
  if (o.remetente) o.remetente = tituloBR(o.remetente);
  if (o.peso) o.peso = pesoNum(o.peso);
  return o;
}
