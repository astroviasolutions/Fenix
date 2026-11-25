import { addDias, norm, quinzena, quinzenaSeguinte, resultadoQuinzena, valorMotorista } from './lib.js';

/* ============ LER a planilha de controle do cliente (uma aba por motorista, DATA + uma coluna por parceiro) ============ */
const num = (c) => (c && typeof c.v === 'number' ? c.v : null);

async function abrir(arquivo) {
  const mod = await import('xlsx'); const XLSX = mod.utils ? mod : mod.default;
  return { XLSX, wb: XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: 'array', cellFormula: true }) };
}
const dataSerial = (v) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

/* Que planilha é esta? controle (aba por motorista) · total (QTD./CARTÃO do parceiro por dia) · fenix (entradas, fixas, impostos) */
export async function classificar(arquivo) {
  const { XLSX, wb } = await abrir(arquivo);
  const cel = (ws, a) => ws?.[a]?.v;
  const abas = wb.SheetNames.map((n) => wb.Sheets[n]).filter(Boolean);
  if (abas.some((ws) => norm(cel(ws, 'A1')) === 'data' && /^qtd/.test(norm(cel(ws, 'B1'))))) return { tipo: 'total', ...lerTotalWb(wb, XLSX) };
  const rotulos = (ws) => Object.values(ws).filter((c) => c && typeof c.v === 'string').map((c) => norm(c.v));
  if (abas.some((ws) => { const r = rotulos(ws); return r.includes('fixas') && r.includes('entradas'); })) return { tipo: 'fenix', ...lerFenixWb(wb, XLSX) };
  const c = lerControleWb(wb, XLSX).filter((x) => !/^conf/i.test(x.nome));
  return c.length ? { tipo: 'controle', abas: c } : { tipo: 'desconhecido' };
}

/* TOTAL_2026.xlsx: por mês, DATA | QTD. | CARTÃO (1ª quinzena em A–C, 2ª em F–H); a tarifa está na fórmula (=B19*2,5) */
function lerTotalWb(wb, XLSX) {
  const informado = []; let tarifa = null, tarifaCartao = null;
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    if (!ws || norm(ws.A1?.v) !== 'data') continue;
    const f = (a) => String(ws[a]?.f || '').match(/\*\s*([\d.]+)\s*$/)?.[1];
    if (f('B20') && ws.B19?.v) tarifa = Number(f('B20')); else tarifa ??= f('B20') ? Number(f('B20')) : null;
    if (f('C20')) tarifaCartao = Number(f('C20'));
    for (const [cd, cq, cc] of [['A', 'B', 'C'], ['F', 'G', 'H']]) {
      let ini = null, qtd = 0, cartao = 0;
      for (let r = 2; r <= 18; r++) {
        const d = ws[`${cd}${r}`]?.v;
        if (typeof d !== 'number' || d < 40000) continue;
        ini ||= dataSerial(d);
        qtd += Number(ws[`${cq}${r}`]?.v) || 0; cartao += Number(ws[`${cc}${r}`]?.v) || 0;
      }
      if (ini && (qtd || cartao)) informado.push({ ini, mes: nome, qtd, cartao });
    }
  }
  return { informado, tarifa, tarifaCartao };
}

/* FENIX_2026.xlsx: coluna FIXAS (nome | valor) e imposto na fórmula (=B20*16%) da aba mais recente */
function lerFenixWb(wb, XLSX) {
  let fixas = [], impostoPct = null, mes = '';
  for (const nome of [...wb.SheetNames].reverse()) {
    const ws = wb.Sheets[nome]; if (!ws) continue;
    const achados = [];
    for (const [a, c] of Object.entries(ws)) { if (a[0] !== '!' && c && typeof c.v === 'string' && norm(c.v) === 'fixas') achados.push(a); }
    if (!achados.length || fixas.length) continue;
    const m = achados[0].match(/^([A-Z]+)(\d+)$/); const col = XLSX.utils.decode_col(m[1]), row0 = Number(m[2]);
    for (let r = row0; r < row0 + 30; r++) {
      const n = ws[XLSX.utils.encode_cell({ r, c: col })]?.v, v = ws[XLSX.utils.encode_cell({ r, c: col + 1 })]?.v;
      if (n && typeof v === 'number' && v > 0 && !/^total$/i.test(String(n).trim())) fixas.push({ nome: String(n).trim(), valor: Math.round(v * 100) });
      else if (!n) break;
    }
    mes = nome;
  }
  for (const nome of [...wb.SheetNames].reverse()) { // imposto: da aba mais recente que tiver a fórmula (=B20*16%)
    for (const c of Object.values(wb.Sheets[nome] || {})) { const t = String(c?.f || '').match(/\*\s*(\d+(?:[.,]\d+)?)\s*%/); if (t) { impostoPct = Number(t[1].replace(',', '.')) / 100; break; } }
    if (impostoPct != null) break;
  }
  return { fixas, impostoPct, mes };
}

export async function lerControle(arquivo) {
  const { XLSX, wb } = await abrir(arquivo);
  return lerControleWb(wb, XLSX);
}
function lerControleWb(wb, XLSX) {
  const abas = [];
  wb.SheetNames.forEach((nome, i) => {
    const ws = wb.Sheets[nome];
    if (!ws || !ws['!ref'] || wb.Workbook?.Sheets?.[i]?.Hidden) return;
    const ref = XLSX.utils.decode_range(ws['!ref']);
    const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    const dataDe = (r) => { const c = cel(r, 0); if (!c || typeof c.v !== 'number' || c.v < 40000) return null; const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(c.v) * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
    const aba = { nome: nome.trim(), lancamentos: [], totais: {}, blocos: [], taxa: null, taxas: {} };
    for (let r = ref.s.r; r <= ref.e.r; r++) {
      const a = cel(r, 0);
      if (!a || norm(a.v) !== 'data') continue;
      /* cabeçalho: nomes dos parceiros */
      const cols = [];
      for (let c = 1; c <= ref.e.c; c++) { const h = cel(r, c); const t = h && String(h.v).trim(); if (!t) break; cols.push({ c, nome: t }); }
      if (!cols.length) continue;
      let k = r + 1;
      const bloco = { ini: null, fim: null, soma: 0, taxa: null, pago: 0 };
      for (; k <= ref.e.r + 1; k++) {
        const d = dataDe(k);
        if (!d) break;
        bloco.ini ||= d; bloco.fim = d;
        for (const { c, nome: pn } of cols) { const v = num(cel(k, c)); if (v) { aba.lancamentos.push({ data: d, parceiro: pn, qtd: Math.round(v) }); bloco.soma += Math.round(v); } }
      }
      /* linhas logo abaixo: totais (=SUM) e valor (=B18*1,2) com o total pago em P */
      for (let x = k; x < k + 3 && x <= ref.e.r; x++) {
        const ehSoma = cols.some(({ c }) => /^SUM\(/i.test(cel(x, c)?.f || ''));
        const mult = cols.map(({ c }) => String(cel(x, c)?.f || '').match(/\*\s*([\d.]+)\s*$/)).find(Boolean);
        if (ehSoma) for (const { c, nome: pn } of cols) { const v = num(cel(x, c)); if (v != null) aba.totais[pn] = (aba.totais[pn] || 0) + v; }
        if (mult) {
          bloco.taxa = Number(mult[1]); aba.taxa ??= bloco.taxa;
          for (const { c, nome: pn } of cols) { const t = String(cel(x, c)?.f || '').match(/\*\s*([\d.]+)\s*$/); if (t && aba.taxas[pn] == null) aba.taxas[pn] = Number(t[1]); } // taxa de cada coluna (ex.: cartão a 1,20 mesmo para quem ganha 1,80)
          for (let c = cols[cols.length - 1].c + 1; c <= ref.e.c; c++) { const f = String(cel(x, c)?.f || ''); if (/^SUM\(/i.test(f) && num(cel(x, c)) != null) { bloco.pago = num(cel(x, c)); break; } }
        }
      }
      if (bloco.ini) aba.blocos.push(bloco);
      r = k;
    }
    if (aba.lancamentos.length || Object.keys(aba.totais).length) abas.push(aba);
  });
  return abas;
}

/* ============ COLAR do Excel ============ */
/* texto copiado do Excel → matriz (linhas × colunas) */
export const matrizDoTexto = (t) => String(t).replace(/\r/g, '').split('\n').filter((l, i, a) => l.length || i < a.length - 1).map((l) => l.split('\t'));
const inteiro = (v) => { const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s || !/^-?\d+([.,]\d+)?$/.test(s)) return null; return Math.round(parseFloat(s.replace(',', '.'))); };
export const numeroOuNulo = inteiro;

/* dd/mm, dd/mm/aaaa, aaaa-mm-dd ou só o dia (1–31, dentro do mês de referência) → ISO */
export function dataDoTexto(t, refIso) {
  const s = String(t ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +refIso.slice(0, 4); return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})$/); if (m && +m[1] >= 1 && +m[1] <= 31) return `${refIso.slice(0, 8)}${String(m[1]).padStart(2, '0')}`;
  return null;
}

/* bloco colado, com ou sem cabeçalho/datas → [{ data, empresaId, qtd }] */
export function lerBlocoColado(matriz, empresas, quinz) {
  const nomes = (linha) => linha.map((c) => empresas.find((e) => norm(e.nome) === norm(c))?.id || null);
  let cab = null, ini = 0;
  for (let i = 0; i < Math.min(matriz.length, 4); i++) { const n = nomes(matriz[i]); if (n.filter(Boolean).length >= 1) { cab = n; ini = i + 1; break; } }
  const out = [], semParceiro = [];
  const dias = []; for (let d = quinz.ini; d <= quinz.fim; d = addDias(d, 1)) dias.push(d);
  matriz.slice(ini).forEach((linha, i) => {
    const d = dataDoTexto(linha[0], quinz.ini);
    const temData = !!d;
    const data = temData ? d : dias[i];
    if (!data) return;
    linha.forEach((cel, j) => {
      if (temData && j === 0) return;
      const qtd = inteiro(cel);
      if (qtd == null) return;
      const empresaId = cab ? cab[j] : empresas[temData ? j - 1 : j]?.id;
      if (empresaId) out.push({ data, empresaId, qtd }); else if (cab) semParceiro.push(j);
    });
  });
  return { itens: out, cabecalho: !!cab, semParceiro: [...new Set(semParceiro)].length };
}

/* ============ EXPORTAR no formato da planilha dele ============ */
const serial = (d) => Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(1899, 11, 30)) / 864e5);

/* Uma aba por motorista (DATA + parceiros, total, × valor, pago), duas quinzenas, com as MESMAS fórmulas da planilha dele:
   o dono abre no Excel e confere que tudo bate. Mais a aba RESULTADO com o que o sistema calcula. */
export async function exportarControle(S, mesRef) {
  const mod = await import('xlsx'); const XLSX = mod.utils ? mod : mod.default;
  const q1 = quinzena(mesRef.slice(0, 8) + '01'), q2 = quinzenaSeguinte(q1);
  const wb = XLSX.utils.book_new();
  const cols = S.empresas, n = cols.length, L = (c) => XLSX.utils.encode_col(c);
  const manual = new Map((S.contagens || []).map((x) => [`${x.data}|${x.motoristaId}|${x.empresaId}`, x.qtd]));
  for (const m of S.motoristas) {
    const ws = {}, put = (r, c, cel) => { ws[XLSX.utils.encode_cell({ r, c })] = cel; };
    let r = 0;
    const v = valorMotorista(S, m) / 100;
    for (const q of [q1, q2]) {
      put(r, 0, { t: 's', v: 'DATA' }); cols.forEach((e, j) => put(r, j + 1, { t: 's', v: e.nome })); put(r, n + 1, { t: 's', v: 'DIA' });
      const ini = r + 1;
      for (let d = q.ini, i = 0; d <= q.fim; d = addDias(d, 1), i++) {
        r++;
        put(r, 0, { t: 'n', v: serial(d), z: 'dd/mm' });
        cols.forEach((e, j) => { const x = manual.get(`${d}|${m.id}|${e.id}`); if (x != null) put(r, j + 1, { t: 'n', v: x }); });
        put(r, n + 1, { t: 'n', f: `SUM(B${r + 1}:${L(n)}${r + 1})` });
      }
      const fim = r; r++;
      put(r, 0, { t: 's', v: 'TOTAL' });
      for (let j = 1; j <= n + 1; j++) put(r, j, { t: 'n', f: `SUM(${L(j)}${ini + 1}:${L(j)}${fim + 1})` });
      const tot = r; r++;
      put(r, 0, { t: 's', v: `× ${v.toFixed(2).replace('.', ',')}` });
      for (let j = 1; j <= n; j++) put(r, j, { t: 'n', f: `${L(j)}${tot + 1}*${v}` });
      put(r, n + 1, { t: 'n', f: `SUM(B${r + 1}:${L(n)}${r + 1})` });
      r += 3;
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: n + 1 } });
    ws['!cols'] = [{ wch: 10 }, ...cols.map(() => ({ wch: 13 })), { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws, (m.nome.replace(/[\\/?*[\]:]/g, '').trim() || 'Motorista').slice(0, 31));
  }
  const rs = [q1, q2].map((q) => resultadoQuinzena(S, q));
  const res = [['RESULTADO', `${q1.ini} a ${q1.fim}`, `${q2.ini} a ${q2.fim}`, 'MÊS']];
  const linha = (nome, f) => res.push([nome, ...rs.map(f), rs.map(f).reduce((a, b) => a + b, 0)]);
  linha('Entradas', (x) => x.receita / 100); linha('Motoristas', (x) => -x.custoMot / 100); linha('Fixas', (x) => -x.custoFixas / 100);
  linha('Combustível', (x) => -x.comb / 100); linha('Impostos', (x) => -x.impostos / 100); linha('SOBRA', (x) => x.saldo / 100);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), 'RESULTADO');
  XLSX.writeFile(wb, `fenix-controle-${q1.ini.slice(0, 7)}.xlsx`);
}
