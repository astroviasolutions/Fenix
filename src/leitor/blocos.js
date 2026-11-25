import { limpa, norm } from './campos.js';
import { agruparLinhas } from './pdf.js';
import { finaliza } from './tabela.js';

/*
  Leitor de FICHAS: cada entrega é um bloco de "Rótulo  valor" (ex.: Magalog).
  Um registro novo começa quando o primeiro rótulo do bloco reaparece.
*/
const ROT = {
  filial: 'remetente', 'entrega n': 'codigo', 'entrega nº': 'codigo', cep: 'cep', endereco: 'endereco', bairro: 'bairro', 'nota fiscal': 'nf',
  nome: 'cliente', destinatario: 'cliente', telefones: 'telefone', telefone: 'telefone', 'cidade uf': 'cidade', cidade: 'cidade', pedido: 'pedido', volumes: 'volumes',
  prazo: 'prazo', periodo: '_', observacoes: '_', 'ponto de referencia': 'referencia',
};
const ehRotulo = (t) => (t.length <= 24 && norm(t) in ROT ? ROT[norm(t)] : undefined);

export function lerBlocos(paginas) {
  const itensLinha = paginas.flatMap((pg) => agruparLinhas(pg.itens).map((l) => l.itens));
  const registros = [];
  let atual = null, primeiro = null;
  for (const linha of itensLinha) {
    for (let i = 0; i < linha.length; i++) {
      const campo = ehRotulo(linha[i].t);
      if (campo === undefined) continue;
      const vals = [];
      let j = i + 1;
      while (j < linha.length && ehRotulo(linha[j].t) === undefined) vals.push(linha[j++].t);
      const valor = limpa(vals.join(' '));
      const rot = norm(linha[i].t);
      if (primeiro === null) primeiro = rot;
      if (rot === primeiro) { atual = {}; registros.push(atual); }
      if (atual && campo !== '_' && valor) atual[campo] = atual[campo] || valor;
      i = j - 1;
    }
  }
  const lista = registros.filter((r) => r.codigo && r.endereco);
  if (lista.length < 2) return null;
  const rotulos = Object.keys(ROT).filter((k) => registros.some((r) => r[ROT[k]]));
  return { registros: lista.map((r) => finaliza({ ...r, observacao: undefined })), colunas: [], assinatura: 'blocos:' + primeiro };
}
