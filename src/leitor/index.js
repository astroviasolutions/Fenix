import { norm } from './campos.js';
import { lerBlocos } from './blocos.js';
import { lerCtrc } from './ctrc.js';
import { linhasDaPlanilha, lerPlanilha } from './planilha.js';
import { paginasDoArquivo } from './pdf.js';
import { lerTabelaPdf } from './tabela.js';

/* Total que o próprio documento informa ("Total 106", "Número total de pacotes: 1"): número logo abaixo do rótulo. */
export function acharTotal(paginas) {
  const itens = paginas[0]?.itens || [];
  for (const rot of itens) {
    const t = norm(rot.t);
    if (!/^(total|numero total de pacotes|total de (pacotes|volumes|entregas)|qtd total)$/.test(t)) continue;
    const abaixo = itens.filter((i) => /^\d{1,5}$/.test(i.t) && Math.abs(i.x - rot.x) < 30 && rot.y - i.y > 3 && rot.y - i.y < 60).sort((a, b) => b.y - a.y)[0];
    if (abaixo) return Number(abaixo.t);
  }
  return null;
}

/* Nome do motorista impresso no documento ("Motorista: FULANO", "Entregador" + valor abaixo…). */
export function acharMotorista(paginas) {
  const itens = paginas[0]?.itens || [];
  for (const rot of itens) {
    if (!/^(motorista|entregador|courier|driver)$/.test(norm(rot.t))) continue;
    const mesma = itens.filter((i) => Math.abs(i.y - rot.y) <= 3 && i.x > rot.x + 2).sort((a, b) => a.x - b.x)[0];
    const abaixo = itens.filter((i) => rot.y - i.y > 3 && rot.y - i.y < 22 && Math.abs(i.x - rot.x) < 40).sort((a, b) => b.y - a.y)[0];
    const v = (mesma || abaixo)?.t.replace(/[\d.\-/]{6,}/g, '').replace(/^[:：\s]+/, '').trim();
    if (v && v.length > 2) return v;
  }
  return '';
}

const completo = (r) => r.codigo && r.endereco;

export function lerPaginas(paginas, mapaManual = null) {
  const cand = [];
  const ctrc = lerCtrc(paginas); if (ctrc) cand.push({ fonte: 'ctrc', ...ctrc });
  const tab = lerTabelaPdf(paginas, mapaManual); if (tab) cand.push({ fonte: 'tabela', ...tab, assinatura: 'tabela:' + tab.colunas.map((c) => norm(c.rotulo)).join('|') });
  const blo = lerBlocos(paginas); if (blo) cand.push({ fonte: 'blocos', ...blo });
  cand.sort((a, b) => b.registros.filter(completo).length - a.registros.filter(completo).length);
  const r = cand[0];
  if (!r) return null;
  const esperado = acharTotal(paginas);
  const avisos = [];
  const lidos = r.registros.filter((x) => x.codigo).length;
  if (esperado != null && esperado !== lidos) avisos.push(`O documento informa ${esperado} no total, mas li ${lidos}. ${lidos < esperado ? `Faltam ${esperado - lidos}: confira se há itens em outra página ou outro formato (ex.: B2B).` : 'Sobrou: confira duplicados.'}`);
  const semEnd = r.registros.filter((x) => x.codigo && !x.endereco).length;
  if (semEnd) avisos.push(`${semEnd} pacote(s) sem endereço legível.`);
  return { ...r, esperado, lidos, avisos, motoristaDoc: acharMotorista(paginas) };
}

/* Entrada única: PDF, XLSX, XLS ou CSV. `reprocessar(mapa)` refaz a leitura com o mapeamento de colunas corrigido à mão. */
export async function lerArquivo(arquivo) {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.pdf')) {
    const paginas = await paginasDoArquivo(arquivo);
    const r = lerPaginas(paginas);
    if (!r) throw new Error('Não reconheci a estrutura deste PDF. Use “Lançar à mão” ou envie o arquivo em Excel/CSV.');
    return { ...r, formato: 'pdf', reprocessar: (mapa) => ({ formato: 'pdf', ...lerPaginas(paginas, mapa) }) };
  }
  if (/\.(xlsx|xls|csv)$/.test(nome)) {
    const linhas = await linhasDaPlanilha(arquivo);
    const r = lerPlanilha(linhas);
    if (!r) throw new Error('A planilha está vazia ou sem cabeçalho.');
    const avisos = r.registros.some(completo) ? [] : ['Não achei as colunas de código e de endereço. Ajuste o mapeamento abaixo.'];
    return { ...r, fonte: 'planilha', formato: 'planilha', lidos: r.registros.length, esperado: null, avisos, reprocessar: (mapa) => { const x = lerPlanilha(linhas, mapa); return { ...x, fonte: 'planilha', formato: 'planilha', lidos: x.registros.length, esperado: null, avisos: [] }; } };
  }
  throw new Error('Formato não suportado. Use PDF, .xlsx, .xls ou .csv.');
}
