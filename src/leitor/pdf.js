import { limpa } from './campos.js';

/* Lê o PDF como itens de texto com posição (x, y, largura) — é a geometria que permite reconstruir tabelas. */
export async function paginasDe(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const itens = tc.items.map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, h: i.height || 0, t: limpa(i.str) })).filter((i) => i.t);
    paginas.push({ n, itens });
  }
  return paginas;
}

/* No navegador: carrega o pdf.js só quando alguém importa um PDF. */
export async function paginasDoArquivo(arquivo) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return paginasDe(pdfjs, new Uint8Array(await arquivo.arrayBuffer()));
}

export function agruparLinhas(itens, tol = 3) {
  const linhas = [];
  for (const it of [...itens].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = linhas.find((r) => Math.abs(r.y - it.y) <= tol);
    if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
  }
  linhas.forEach((l) => l.itens.sort((a, b) => a.x - b.x));
  return linhas;
}

/* Junta os pedaços de uma célula (várias linhas) em um texto só; "84130-" + "000" cola sem espaço. */
export function juntaTexto(itens) {
  const ord = [...itens].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
  let s = '';
  for (const it of ord) s += (s && !/[(/]$/.test(s) && !/^[)/]/.test(it.t) && !(/-$/.test(s) && /^\d/.test(it.t)) ? ' ' : '') + it.t;
  return limpa(s);
}
