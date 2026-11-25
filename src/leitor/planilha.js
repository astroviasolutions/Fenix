import { campoDoRotulo, campoPeloConteudo, limpa } from './campos.js';
import { finaliza } from './tabela.js';

/* Excel / CSV: acha a linha de cabeçalho, mapeia as colunas pelo nome (ou pelo conteúdo) e devolve registros padronizados. */
export async function linhasDaPlanilha(arquivo) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

export function lerPlanilha(linhas, mapaManual = null) {
  let h = -1, melhor = 0;
  linhas.slice(0, 25).forEach((l, i) => {
    const campos = new Set(l.map((c) => campoDoRotulo(c)?.[0]).filter(Boolean));
    if (campos.size > melhor) { melhor = campos.size; h = i; }
  });
  if (h < 0 || melhor < 2) h = linhas.findIndex((l) => l.filter((c) => String(c).trim()).length >= 2); // sem cabeçalho legível: 1ª linha cheia
  if (h < 0) return null;
  const cab = linhas[h].map((c) => limpa(c));
  const dados = linhas.slice(h + 1).filter((l) => l.some((c) => String(c).trim()));
  const col = (ci) => dados.map((l) => limpa(l[ci])).filter(Boolean);
  const mapa = {}, usados = new Set();
  const cands = cab.map((rotulo, ci) => ({ ci, rotulo, v: col(ci), r: campoDoRotulo(rotulo) })).filter((x) => x.v.length);
  if (mapaManual) Object.entries(mapaManual).forEach(([ci, c]) => { if (c) { mapa[ci] = c; usados.add(c); } });
  else {
    for (const x of cands.filter((x) => x.r).sort((a, b) => a.r[1] - b.r[1])) if (!usados.has(x.r[0])) { mapa[x.ci] = x.r[0]; usados.add(x.r[0]); }
    for (const x of cands) { if (mapa[x.ci]) continue; const c = campoPeloConteudo(x.v); if (c && !usados.has(c)) { mapa[x.ci] = c; usados.add(c); } }
  }
  const registros = dados.map((l, n) => {
    const o = { _n: n + 1 };
    for (const [ci, campo] of Object.entries(mapa)) o[campo] = limpa(l[ci]);
    return finaliza(o);
  });
  const colunas = cab.map((rotulo, ci) => ({ indice: ci, rotulo: rotulo || `Coluna ${ci + 1}`, campo: mapa[ci] || null, amostra: col(ci).slice(0, 3) })).filter((c) => c.amostra.length);
  return { registros, colunas, assinatura: 'planilha:' + cab.filter(Boolean).join('|') };
}
