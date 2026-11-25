import { limpa, norm } from './campos.js';
import { agruparLinhas } from './pdf.js';
import { finaliza } from './tabela.js';

/*
  Romaneio de transportadora com CABEÇALHO EM 3 LINHAS e registro de várias linhas (CTRC / NFISCAL / REMETENTE… na 1ª;
  RECEBEDOR / BAIRRO / CEP na 2ª; END ENTREGA na 3ª). As posições vêm do próprio cabeçalho, então pequenos deslocamentos não quebram.
*/
const perto = (itens, x, tol = 9) => itens.filter((i) => Math.abs(i.x - x) <= tol);
const txt = (its) => limpa(its.map((i) => i.t).join(' '));

export function lerCtrc(paginas) {
  const registros = [];
  for (const pg of paginas) {
    const linhas = agruparLinhas(pg.itens);
    const h1 = linhas.findIndex((l) => l.itens.some((i) => norm(i.t) === 'ctrc') && l.itens.some((i) => norm(i.t) === 'nfiscal'));
    if (h1 < 0) continue;
    const L1 = linhas[h1].itens, L2 = linhas[h1 + 1]?.itens || [], L3 = linhas[h1 + 2]?.itens || [];
    const xr = (L, rx) => L.find((i) => rx.test(norm(i.t)))?.x;
    const X = {
      codigo: xr(L1, /^ctrc$/), nf: xr(L1, /^nfiscal$/), remetente: xr(L1, /^remetente$/), telefone: xr(L1, /^fone/), cidade: xr(L1, /^cidade$/),
      cliente: xr(L2, /^recebedor$/), bairro: xr(L2, /^bairro$/), cep: xr(L2, /^cep$/), endereco: xr(L3, /^end/),
    };
    if (X.codigo == null || X.endereco == null) continue;
    const dados = linhas.slice(h1 + 3);
    let k = -1;
    const grupos = [];
    for (const l of dados) {
      const ancora = perto(l.itens, X.codigo).find((i) => /^[A-Z]{2,4}\d{4,}-\d$/.test(i.t));
      if (ancora) { grupos.push([]); k = grupos.length - 1; }
      if (k >= 0) grupos[k].push(l.itens);
    }
    for (const g of grupos) {
      const [r1, r2 = [], ...resto] = g;
      const endLinha = resto.find((l) => perto(l, X.endereco).length && /^\d{3,5}$/.test(l[0]?.t || '') ) || resto.find((l) => perto(l, X.endereco).length && !/^(comprovante|dacte)/i.test(l[0]?.t || ''));
      registros.push({
        codigo: txt(perto(r1, X.codigo)), nf: txt(perto(r1, X.nf)), remetente: txt(perto(r1, X.remetente, 20)), telefone: txt(perto(r1, X.telefone)), cidade: txt(perto(r1, X.cidade, 12)),
        cliente: txt(perto(r2, X.cliente, 20)), bairro: txt(perto(r2, X.bairro)), cep: txt(perto(r2, X.cep)),
        endereco: endLinha ? txt(perto(endLinha, X.endereco)) : '',
      });
    }
  }
  const lista = registros.filter((r) => r.codigo && r.endereco);
  if (!lista.length) return null;
  return { registros: lista.map(finaliza), colunas: [], assinatura: 'ctrc' };
}
