import { useSyncExternalStore } from 'react';
import { uid } from './lib.js';

/*
  Camada de dados. Hoje: localStorage (modo demonstração).
  Quando o Supabase estiver criado, é aqui que o driver de nuvem entra:
  as telas só usam useStore() e act.*, então nada mais precisa mudar.
*/
const KEY = 'fenix_v1';

export const vazio = () => ({
  v: 1, demo: false,
  empresas: [], motoristas: [], romaneios: [], paradas: [], lancamentos: [], acertos: [], veiculos: [],
  contagens: [],      // lançamento manual: { data, motoristaId, empresaId, qtd }
  conferencias: [],   // conferência com o parceiro: { ini, empresaId, informado, ajuste }
  ajustes: { saldoInicial: 0, valorPadrao: 0, meta: 0, categorias: [], impostoPct: 0, fixas: [] },
});

function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); return { ...vazio(), ...s, ajustes: { ...vazio().ajustes, ...s.ajustes } }; }
  } catch { /* dados corrompidos: começa vazio */ }
  return vazio();
}

let state = carregar();
const subs = new Set();

export const getState = () => state;
export function setState(fn) {
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Não foi possível salvar no navegador', e); }
  subs.forEach((f) => f());
}
export const useStore = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

export const act = {
  limpar: () => setState(() => vazio()),
  async carregarDemo() { const { gerarDemo } = await import('./seed.js'); setState(() => gerarDemo()); },
  add: (col, item) => { const id = uid(); setState((s) => ({ ...s, [col]: [...s[col], { id, ...item }] })); return id; },
  upd: (col, id, patch) => setState((s) => ({ ...s, [col]: s[col].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  del: (col, id) => setState((s) => ({ ...s, [col]: s[col].filter((x) => x.id !== id) })),
  /* lança (ou apaga, se vazio) a contagem manual de um motorista × parceiro × dia */
  contar: (data, motoristaId, empresaId, qtd) => setState((s) => {
    const resto = s.contagens.filter((c) => !(c.data === data && c.motoristaId === motoristaId && c.empresaId === empresaId));
    return { ...s, contagens: qtd === null || qtd === '' || Number.isNaN(qtd) ? resto : [...resto, { id: uid(), data, motoristaId, empresaId, qtd: Math.round(qtd) }] };
  }),
  conferir: (ini, empresaId, patch) => setState((s) => {
    const ex = s.conferencias.find((c) => c.ini === ini && c.empresaId === empresaId);
    return { ...s, conferencias: ex ? s.conferencias.map((c) => (c === ex ? { ...c, ...patch } : c)) : [...s.conferencias, { id: uid(), ini, empresaId, informado: null, ajuste: 0, ...patch }] };
  }),
  ajustes: (patch) => setState((s) => ({ ...s, ajustes: { ...s.ajustes, ...patch } })),

  baixar: (id, status, gps) => act.upd('paradas', id, { status, baixaEm: new Date().toISOString(), gps: gps || null }),
  desfazer: (id) => act.upd('paradas', id, { status: 'pendente', baixaEm: null, gps: null }),

  /* grupos: [{ empresaId, paradas }] — um romaneio por parceiro (um PDF da Total pode trazer pacote e cartão) */
  importar: ({ data, arquivo, grupos, motoristaId = null }) => setState((s) => {
    const romaneios = [], paradas = [];
    for (const g of grupos) {
      const id = uid();
      romaneios.push({ id, empresaId: g.empresaId, data, arquivo, finalizado: false });
      for (const p of g.paradas) paradas.push({ id: uid(), romaneioId: id, status: 'pendente', baixaEm: null, bipadoEm: null, ...p, motoristaId: p.motoristaId || motoristaId });
    }
    return { ...s, romaneios: [...s.romaneios, ...romaneios], paradas: [...s.paradas, ...paradas] };
  }),
  /* bipagem: confere o pacote na carga do motorista (e o atribui a ele se ainda não tinha dono) */
  bipar: (codigo, motoristaId) => {
    const cod = String(codigo).trim().toLowerCase();
    const s = getState();
    const p = s.paradas.find((x) => x.pacotes.some((c) => c.toLowerCase() === cod));
    if (!p) return { ok: false, motivo: 'nao_achado' };
    if (p.motoristaId && p.motoristaId !== motoristaId) return { ok: false, motivo: 'outro_motorista', parada: p };
    const bip = { ...(p.bipados || {}) };
    if (bip[cod]) return { ok: true, repetido: true, parada: p };
    bip[cod] = new Date().toISOString();
    act.upd('paradas', p.id, { motoristaId: motoristaId || p.motoristaId, bipados: bip, bipadoEm: Object.keys(bip).length === p.pacotes.length ? new Date().toISOString() : p.bipadoEm || null });
    return { ok: true, parada: p, completa: Object.keys(bip).length === p.pacotes.length };
  },
  excluirRomaneio: (id) => setState((s) => ({ ...s, romaneios: s.romaneios.filter((r) => r.id !== id), paradas: s.paradas.filter((p) => p.romaneioId !== id) })),
  distribuir: (cidade, motoristaId) => setState((s) => ({
    ...s, paradas: s.paradas.map((p) => (!p.motoristaId && (p.cidade || 'Sem cidade') === cidade && p.status === 'pendente' ? { ...p, motoristaId } : p)),
  })),

  /* acerto quinzenal: cria o registro na primeira alteração */
  acertoGarantir: (motoristaId, q) => {
    const s = getState();
    const ex = s.acertos.find((a) => a.motoristaId === motoristaId && a.ini === q.ini);
    if (ex) return ex.id;
    return act.add('acertos', { motoristaId, ini: q.ini, fim: q.fim, descontos: [], aprovadoEm: null, lancId: null });
  },
  descontoAdd: (motoristaId, q, desc, valor) => {
    const id = act.acertoGarantir(motoristaId, q);
    setState((s) => ({ ...s, acertos: s.acertos.map((a) => (a.id === id ? { ...a, descontos: [...a.descontos, { id: uid(), desc, valor }] } : a)) }));
  },
  descontoDel: (acertoId, dId) => setState((s) => ({ ...s, acertos: s.acertos.map((a) => (a.id === acertoId ? { ...a, descontos: a.descontos.filter((d) => d.id !== dId) } : a)) })),
  aprovar: (motoristaId, q, liquido, nome, hojeISO) => {
    const id = act.acertoGarantir(motoristaId, q);
    const lancId = act.add('lancamentos', {
      data: hojeISO, tipo: 'saida', categoria: 'Comissão de motorista', pago: true, venc: hojeISO, origem: 'comissao',
      descricao: `Acerto ${nome} · ${q.ini.slice(8)}/${q.ini.slice(5, 7)} a ${q.fim.slice(8)}/${q.fim.slice(5, 7)}`, valor: liquido,
    });
    act.upd('acertos', id, { aprovadoEm: new Date().toISOString(), lancId });
  },
  desaprovar: (acertoId) => {
    const a = getState().acertos.find((x) => x.id === acertoId);
    if (a?.lancId) act.del('lancamentos', a.lancId);
    act.upd('acertos', acertoId, { aprovadoEm: null, lancId: null });
  },
};
