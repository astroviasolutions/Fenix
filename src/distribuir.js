import { norm } from './lib.js';

/* Rota = paradas do mesmo bairro (dentro da cidade). É a unidade que o dono distribui. */
export function agruparRotas(paradas) {
  const m = new Map();
  const nomeCidade = (p) => String(p.cidade || '').replace(/\/.*$/, '').trim();
  /* PDF sem cidade (Total): se só existe uma cidade no conjunto, é ela */
  const unicas = [...new Set(paradas.map(nomeCidade).filter(Boolean))];
  const padrao = unicas.length === 1 ? unicas[0] : 'Sem cidade';
  /* bairro cortado pelo parceiro ("Jardim Das Ar") vira o nome completo mais comprido que começa igual */
  const nomes = [...new Set(paradas.map((p) => String(p.bairro || '').trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const completo = new Map();
  for (const n of nomes) completo.set(n, nomes.find((l) => l.length > n.length && norm(l).startsWith(norm(n)) && norm(n).length >= 4) || n);
  for (const p of paradas) {
    const cidade = nomeCidade(p) || padrao;
    const bairro = completo.get(String(p.bairro || '').trim()) || 'Sem bairro';
    const key = `${norm(cidade)}|${norm(bairro)}`;
    let r = m.get(key);
    if (!r) { r = { key, cidade, bairro, paradas: [], pacotes: 0 }; m.set(key, r); }
    r.paradas.push(p); r.pacotes += p.pacotes.length;
  }
  return [...m.values()].sort((a, b) => a.cidade.localeCompare(b.cidade) || b.pacotes - a.pacotes);
}

/*
  Divide as rotas entre os motoristas de forma equilibrada em pacotes, mantendo cada bairro junto sempre que dá.
  Bairro muito maior que a fatia ideal é cortado por rua (paradas em ordem de endereço), para ninguém ficar sobrecarregado.
*/
export function dividir(rotas, motoristaIds) {
  const n = motoristaIds.length;
  const total = rotas.reduce((t, r) => t + r.pacotes, 0);
  if (!n || !total) return { atribuicao: new Map(), cargas: {} };
  const ideal = total / n;
  const unidades = [];
  for (const r of rotas) {
    if (n > 1 && r.pacotes > ideal * 1.25) {
      const ord = [...r.paradas].sort((a, b) => norm(a.endereco).localeCompare(norm(b.endereco), 'pt', { numeric: true }));
      const partes = Math.max(2, Math.round(r.pacotes / ideal));
      const alvo = r.pacotes / partes;
      let atual = { paradas: [], pacotes: 0 };
      for (const p of ord) {
        atual.paradas.push(p); atual.pacotes += p.pacotes.length;
        if (atual.pacotes >= alvo && unidades.filter((u) => u.de === r.key).length < partes - 1) { unidades.push({ ...atual, de: r.key }); atual = { paradas: [], pacotes: 0 }; }
      }
      if (atual.paradas.length) unidades.push({ ...atual, de: r.key });
    } else unidades.push({ paradas: r.paradas, pacotes: r.pacotes, de: r.key });
  }
  const cargas = Object.fromEntries(motoristaIds.map((id) => [id, 0]));
  const atribuicao = new Map();
  for (const u of unidades.sort((a, b) => b.pacotes - a.pacotes)) {
    const id = motoristaIds.reduce((a, b) => (cargas[b] < cargas[a] ? b : a));
    cargas[id] += u.pacotes;
    for (const p of u.paradas) atribuicao.set(p.id, id);
  }
  return { atribuicao, cargas };
}
