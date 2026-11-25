import { norm } from './lib.js';

/*
  "Entrega casada": o mesmo destinatário (ou o mesmo endereço) recebendo pacotes de parceiros diferentes.
  Nomes vêm cortados pelo parceiro ("Larissa Ca"), então o nome é comparado por prefixo, e o endereço por via + número.
*/
const TIPO = /^(rua|r|avenida|av|travessa|tv|alameda|al|praca|pca|rodovia|rod|estrada|estr)\s+/;

export function chaveEndereco(end) {
  const t = norm(end).replace(TIPO, '');
  const m = t.match(/^(.*?)\s+(?:n\s+)?(\d{1,5})(?:\s|$)/);
  if (!m || !m[1]) return null;
  return { via: m[1].trim(), numero: m[2] };
}
const viaIgual = (a, b) => a === b || (Math.min(a.length, b.length) >= 8 && (a.startsWith(b) || b.startsWith(a)));
const pref = (a, b) => a === b || (Math.min(a.length, b.length) >= 2 && (a.startsWith(b) || b.startsWith(a)));

export function nomeCompativel(a, b) {
  const x = norm(a).split(' ').filter(Boolean), y = norm(b).split(' ').filter(Boolean);
  if (!x.length || !y.length || x[0].length < 3 || !pref(x[0], y[0])) return false;
  return x.length < 2 || y.length < 2 || pref(x[1], y[1]) || x.slice(1).some((t) => t.length > 2 && y.includes(t));
}

/*
  alvos: [{ id, empresaId, endereco, cliente }]   base: [{ id, empresaId, endereco, cliente, pacotes }]
  → Map(id do alvo → [{ empresaId, cliente, endereco, pacotes, mesmoCliente }]) só com parceiros DIFERENTES.
*/
export function acharCasadas(alvos, base) {
  const porNumero = new Map();
  for (const b of base) {
    const k = chaveEndereco(b.endereco);
    if (!k) continue;
    (porNumero.get(k.numero) || porNumero.set(k.numero, []).get(k.numero)).push({ ...b, via: k.via });
  }
  const out = new Map();
  for (const a of alvos) {
    const k = chaveEndereco(a.endereco);
    if (!k) continue;
    const achados = (porNumero.get(k.numero) || []).filter((b) => b.empresaId !== a.empresaId && b.id !== a.id && viaIgual(k.via, b.via));
    if (achados.length) out.set(a.id, achados.map((b) => ({ empresaId: b.empresaId, cliente: b.cliente, endereco: b.endereco, pacotes: b.pacotes, mesmoCliente: nomeCompativel(a.cliente, b.cliente) })));
  }
  return out;
}
