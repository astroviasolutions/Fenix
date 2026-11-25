import { cepFmt, limpa, norm } from './campos.js';
import { agruparLinhas } from './pdf.js';
import { finaliza } from './tabela.js';

/*
  DACTE (CT-e): cada página é um conhecimento de transporte (os B2B que a Total junta ao fim do manifesto).
  Lê o número do documento, o destinatário e o endereço de entrega. A mesma página repetida (2ª via) vira o mesmo código
  e é descartada na importação como repetida.
*/
export function lerCte(paginas) {
  const registros = [];
  for (const pg of paginas) {
    const itens = pg.itens;
    if (!itens.some((i) => /^dacte$/i.test(i.t)) && !itens.some((i) => /^nro\.?documento$/i.test(norm(i.t).replace(/ /g, '')))) continue;
    const dest = itens.find((i) => norm(i.t) === 'destinatario' && i.x > 200);
    if (!dest) continue;
    const doc = itens.find((i) => /^\d{9}$/.test(i.t) && i.x > 440 && i.y > 700);
    const linhas = agruparLinhas(itens);
    const lin = (y) => linhas.find((l) => Math.abs(l.y - y) <= 3)?.itens || [];
    const dir = (l, x) => limpa(l.filter((i) => i.x > x + 5).map((i) => i.t).join(' '));
    const lDest = lin(dest.y);
    const nome = dir(lDest, dest.x);
    const iEnd = linhas.findIndex((l) => l.y < dest.y && l.itens.some((i) => norm(i.t) === 'endereco' && Math.abs(i.x - dest.x) < 15));
    if (iEnd < 0 || !doc) continue;
    const lEnd = linhas[iEnd].itens, lBairro = linhas[iEnd + 1]?.itens || [];
    const endereco = dir(lEnd, dest.x).replace(/,\s*(\S+),\s*\1(?=\s|$)/, ', $1'); // "375, 375" → "375"
    const bairro = limpa(lBairro.filter((i) => i.x >= dest.x - 5).map((i) => i.t).join(' '));
    const lMun = linhas.slice(iEnd).find((l) => l.itens.some((i) => norm(i.t) === 'municipio' && Math.abs(i.x - dest.x) < 15))?.itens || [];
    const mun = lMun.find((i) => Math.abs(i.x - (lMun.find((k) => norm(k.t) === 'municipio' && Math.abs(k.x - dest.x) < 15)?.x ?? 0)) > 5 && i.x > dest.x && !/^cep$/i.test(i.t));
    const iCep = lMun.findIndex((i) => /^cep$/i.test(i.t) && i.x > dest.x);
    const cep = cepFmt(iCep >= 0 ? lMun[iCep + 1]?.t : '');
    const rem = limpa(lin(itens.find((i) => norm(i.t) === 'remetente')?.y).filter((i) => i.x > 40 && i.x < dest.x).map((i) => i.t).join(' ')).replace(/^REMETENTE\s*/i, '');
    registros.push(finaliza({ codigo: doc.t, cliente: nome, endereco, bairro, cidade: mun ? mun.t : '', cep, remetente: rem, servico: 'B2B', tipo: 'B2B' }));
  }
  const vistos = new Set();
  const unicos = registros.filter((r) => !vistos.has(r.codigo) && vistos.add(r.codigo)); // 2ª via do mesmo CT-e
  return unicos.length ? unicos : null;
}
