/* ---------- formatação e datas ---------- */
export const brl = (c = 0) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n = 0) => n.toLocaleString('pt-BR');
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => iso(new Date());
export const parse = (s) => new Date(s + 'T12:00:00');
export const addDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const dataBR = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const pct = (n) => `${(n * 100).toFixed((n * 100) % 1 === 0 ? 0 : 1).replace('.', ',')}%`;
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const rotuloMes = (s) => `${MESES[parse(s).getMonth()]} ${parse(s).getFullYear()}`;

/* "1.234,56" / "12,5" / 12.5 -> centavos (inteiro) */
export function centavos(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const neg = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return (neg ? -1 : 1) * Math.round(n * 100);
}
export const reais = (c) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

/* normaliza endereço: "R. das Flores, nº 10" == "rua das flores 10" */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\br\.\s*/g, 'rua ')
    .replace(/\bav\.\s*/g, 'avenida ')
    .replace(/n[º°]\s*/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- períodos ---------- */
const diasNoMes = (y, m) => new Date(y, m + 1, 0).getDate();
export function shiftMes(s, n) {
  const d = parse(s);
  const y = d.getFullYear(), m = d.getMonth() + n;
  const alvo = new Date(y, m, 1);
  return iso(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), diasNoMes(alvo.getFullYear(), alvo.getMonth()))));
}
export function quinzena(ref) {
  const d = parse(ref), y = d.getFullYear(), m = d.getMonth();
  return d.getDate() <= 15
    ? { ini: iso(new Date(y, m, 1)), fim: iso(new Date(y, m, 15)) }
    : { ini: iso(new Date(y, m, 16)), fim: iso(new Date(y, m, diasNoMes(y, m))) };
}
export const quinzenaAnterior = (q) => quinzena(addDias(q.ini, -1));
export const quinzenaSeguinte = (q) => quinzena(addDias(q.fim, 1));
const anterior = (ini, fim) => { const n = diasEntre(ini, fim) + 1; return { ini: addDias(ini, -n), fim: addDias(ini, -1) }; };

export const PERIODOS = [
  ['hoje', 'Hoje'], ['7d', '7 dias'], ['quinzena', 'Quinzena'], ['passada', 'Quinzena passada'], ['mes', 'Este mês'], ['3m', '3 meses'],
];
export function periodo(chave, ref = hoje()) {
  let ini = ref, fim = ref, ant;
  if (chave === '7d') ini = addDias(ref, -6);
  else if (chave === 'quinzena') ({ ini, fim } = quinzena(ref));
  else if (chave === 'passada') ({ ini, fim } = quinzenaAnterior(quinzena(ref)));
  else if (chave === 'mes') { ini = ref.slice(0, 8) + '01'; ant = { ini: shiftMes(ini, -1), fim: shiftMes(ref, -1) }; }
  else if (chave === '3m') { ini = shiftMes(ref.slice(0, 8) + '01', -2); ant = { ini: shiftMes(ini, -3), fim: shiftMes(ref, -3) }; }
  return { ini, fim, ant: ant || anterior(ini, fim) };
}

/* ---------- regras de negócio ---------- */
export const STATUS = {
  pendente: 'Pendente', entregue: 'Entregue', ausente: 'Cliente ausente', recusado: 'Recusado',
  avaria: 'Avaria', endereco_errado: 'Endereço errado', reagendar: 'Reagendar',
};
export const OCORRENCIAS = ['ausente', 'recusado', 'avaria', 'endereco_errado', 'reagendar'];
export const CATEGORIAS_BASE = ['Repasse de parceira', 'Combustível', 'Manutenção', 'Parcela de veículo', 'Impostos', 'Comissão de motorista', 'Outras'];
export const CAT_COMISSAO = 'Comissão de motorista';

export const valorMotorista = (S, m) => (m.valor > 0 ? m.valor : S.ajustes.valorPadrao || 0);

/* Pacotes por dia × motorista × parceiro.
   O que o dono lança à mão (aba Contagem) vale mais; sem lançamento, vale o que foi bipado/baixado pelo motorista.
   Se os dois existem e são diferentes, marca divergência para conferir. */
export function pacotesPeriodo(S, { ini, fim, empresaId = '', motoristaId = '' }) {
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const mapa = new Map();
  const no = (data, m, e) => {
    const k = `${data}|${m || '_'}|${e}`;
    let x = mapa.get(k);
    if (!x) { x = { data, motoristaId: m || null, empresaId: e, manual: null, bipado: 0 }; mapa.set(k, x); }
    return x;
  };
  const passa = (data, m, e) => data >= ini && data <= fim && (!empresaId || e === empresaId) && (!motoristaId || m === motoristaId);
  for (const p of S.paradas) {
    if (p.status !== 'entregue') continue;
    const r = rom.get(p.romaneioId);
    if (r && passa(r.data, p.motoristaId, r.empresaId)) no(r.data, p.motoristaId, r.empresaId).bipado += p.pacotes.length;
  }
  for (const c of S.contagens || []) if (passa(c.data, c.motoristaId, c.empresaId)) no(c.data, c.motoristaId, c.empresaId).manual = c.qtd;
  return [...mapa.values()].map((x) => ({ ...x, qtd: x.manual ?? x.bipado, diverge: x.manual != null && x.bipado > 0 && x.manual !== x.bipado }));
}

export function agregarPacotes(S, filtros) {
  const emp = new Map(S.empresas.map((e) => [e.id, e]));
  const o = { total: 0, receita: 0, semTarifa: false, porMotorista: {}, porEmpresa: {}, porDia: {}, divergencias: [] };
  for (const x of pacotesPeriodo(S, filtros)) {
    if (!x.qtd) continue;
    o.total += x.qtd;
    if (x.motoristaId) o.porMotorista[x.motoristaId] = (o.porMotorista[x.motoristaId] || 0) + x.qtd;
    o.porEmpresa[x.empresaId] = (o.porEmpresa[x.empresaId] || 0) + x.qtd;
    o.porDia[x.data] = (o.porDia[x.data] || 0) + x.qtd;
    const e = emp.get(x.empresaId);
    if (e?.tarifa > 0) o.receita += x.qtd * e.tarifa; else o.semTarifa = true;
    if (x.diverge) o.divergencias.push(x);
  }
  return o;
}

/* Percorre as paradas de um período, já aplicando filtros. */
export function metricas(S, { ini, fim, empresaId = '', motoristaId = '' }) {
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const emp = new Map(S.empresas.map((e) => [e.id, e]));
  const o = { entregues: 0, ocorrencias: 0, pendentes: 0, noPrazo: 0, foraPrazo: 0, receita: 0, semTarifa: false, porMotorista: {}, porCidade: {}, porDia: {} };
  for (const p of S.paradas) {
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim) continue;
    if (empresaId && r.empresaId !== empresaId) continue;
    if (motoristaId && p.motoristaId !== motoristaId) continue;
    const n = p.pacotes.length;
    const mk = p.motoristaId || '_';
    const pm = (o.porMotorista[mk] ||= { entregues: 0, ocorrencias: 0 });
    if (p.status === 'entregue') {
      o.entregues += n; pm.entregues += n;
      o.porDia[r.data] = (o.porDia[r.data] || 0) + n;
      const e = emp.get(r.empresaId);
      if (e?.tarifa > 0) o.receita += n * e.tarifa; else o.semTarifa = true;
      const limite = addDias(r.data, e?.prazoDias ?? 1);
      if ((p.baixaEm || r.data).slice(0, 10) <= limite) o.noPrazo += n; else o.foraPrazo += n;
    } else if (p.status === 'pendente') {
      o.pendentes += n;
    } else {
      o.ocorrencias += n; pm.ocorrencias += n;
      const c = p.cidade || 'Sem cidade';
      o.porCidade[c] = (o.porCidade[c] || 0) + n;
    }
  }
  const u = agregarPacotes(S, { ini, fim, empresaId, motoristaId });
  o.entreguesBipadas = o.entregues;
  o.entregues = u.total; o.receita = u.receita; o.semTarifa = u.semTarifa; o.porDia = u.porDia; o.divergencias = u.divergencias;
  for (const k in o.porMotorista) o.porMotorista[k].entregues = 0;
  for (const [id, n] of Object.entries(u.porMotorista)) (o.porMotorista[id] ||= { entregues: 0, ocorrencias: 0 }).entregues = n;
  return o;
}

/* Quanto custa cada motorista no período (por pacote, ou salário fixo proporcional aos dias). */
export function custoMotoristas(S, ini, fim, porMotorista, soMotorista = '') {
  const dias = Math.min(diasEntre(ini, fim) + 1, 30);
  const por = {}; let total = 0;
  for (const m of S.motoristas) {
    if (soMotorista && m.id !== soMotorista) continue;
    const v = m.tipo === 'fixo' ? Math.round((m.valor * dias) / 30) : (porMotorista[m.id]?.entregues || 0) * valorMotorista(S, m);
    if (v > 0) { por[m.id] = v; total += v; }
  }
  return { por, total };
}

/* Acerto quinzenal de um motorista. */
export function acertoQuinzena(S, m, q) {
  const dados = metricas(S, { ini: q.ini, fim: q.fim, motoristaId: m.id });
  const operou = S.romaneios.some((r) => r.data >= q.ini && r.data <= q.fim) || (S.contagens || []).some((c) => c.data >= q.ini && c.data <= q.fim);
  const pacotes = dados.entregues;
  const bruto = m.tipo === 'fixo' ? (operou ? Math.round(m.valor / 2) : 0) : pacotes * valorMotorista(S, m);
  const reg = S.acertos.find((a) => a.motoristaId === m.id && a.ini === q.ini);
  const descontos = reg?.descontos || [];
  const totalDesc = descontos.reduce((s, d) => s + d.valor, 0);
  return { motorista: m, pacotes, bruto, descontos, totalDesc, liquido: Math.max(bruto - totalDesc, 0), reg, aprovado: !!reg?.aprovadoEm };
}

/* Quinzenas com operação (a partir dos romaneios). */
export function quinzenasComOperacao(S) {
  const m = new Map();
  for (const r of S.romaneios) { const q = quinzena(r.data); m.set(q.ini, q); }
  for (const c of S.contagens || []) { if (!c.qtd) continue; const q = quinzena(c.data); m.set(q.ini, q); }
  return [...m.values()].sort((a, b) => a.ini.localeCompare(b.ini));
}

/* Comissões geradas pelas entregas que ainda não foram aprovadas/pagas. */
export function comissoesAbertas(S) {
  const lista = [];
  for (const q of quinzenasComOperacao(S)) {
    for (const m of S.motoristas) {
      const a = acertoQuinzena(S, m, q);
      if (a.liquido > 0 && !a.aprovado) lista.push({ ...a, q });
    }
  }
  return lista;
}

export function saldoHoje(S) {
  let s = S.ajustes.saldoInicial || 0;
  for (const l of S.lancamentos) if (l.pago) s += l.tipo === 'entrada' ? l.valor : -l.valor;
  return s;
}
export function saldoPrevisto(S, ate) {
  let s = saldoHoje(S);
  for (const l of S.lancamentos) if (!l.pago && (l.venc || l.data) <= ate) s += l.tipo === 'entrada' ? l.valor : -l.valor;
  return s - comissoesAbertas(S).reduce((t, c) => t + c.liquido, 0);
}
export function fluxoPeriodo(S, ini, fim) {
  let entradas = 0, saidas = 0, despesas = 0;
  for (const l of S.lancamentos) {
    if (!l.pago || l.data < ini || l.data > fim) continue;
    if (l.tipo === 'entrada') entradas += l.valor;
    else { saidas += l.valor; if (l.categoria !== CAT_COMISSAO) despesas += l.valor; }
  }
  return { entradas, saidas, despesas, resultado: entradas - saidas };
}

/* Resultado de uma quinzena, como na planilha do cliente:
   entradas (parceiros) − motoristas − fixas (só na 1ª quinzena do mês) − combustível − impostos. */
export function resultadoQuinzena(S, q) {
  const u = agregarPacotes(S, { ini: q.ini, fim: q.fim });
  const entradas = S.empresas.map((e) => ({ id: e.id, nome: e.nome, qtd: u.porEmpresa[e.id] || 0, valor: (u.porEmpresa[e.id] || 0) * (e.tarifa || 0), semTarifa: !(e.tarifa > 0) && (u.porEmpresa[e.id] || 0) > 0 })).filter((x) => x.qtd > 0);
  const motoristas = S.motoristas.map((m) => ({ id: m.id, nome: m.nome, acerto: acertoQuinzena(S, m, q) })).filter((x) => x.acerto.bruto > 0);
  const custoMot = motoristas.reduce((t, x) => t + x.acerto.bruto, 0);
  const receita = entradas.reduce((t, x) => t + x.valor, 0);
  const primeira = parse(q.ini).getDate() === 1;
  const fixas = primeira ? (S.ajustes.fixas || []) : [];
  const custoFixas = fixas.reduce((t, f) => t + f.valor, 0);
  const comb = S.lancamentos.filter((l) => l.tipo === 'saida' && l.categoria === 'Combustível' && l.data >= q.ini && l.data <= q.fim).reduce((t, l) => t + l.valor, 0);
  const impostos = Math.round(receita * (S.ajustes.impostoPct || 0));
  return { q, entradas, receita, motoristas, custoMot, fixas, custoFixas, comb, impostos, saldo: receita - custoMot - custoFixas - comb - impostos, divergencias: u.divergencias.length, semTarifa: entradas.some((x) => x.semTarifa) };
}
