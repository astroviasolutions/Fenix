import { useMemo, useState } from 'react';
import { acharCasadas } from '../casadas.js';
import { agruparRotas, dividir } from '../distribuir.js';
import { dataBR, num } from '../lib.js';
import { act, useStore } from '../store.js';
import { Icon } from '../ui.jsx';

const primeiroNome = (n) => String(n).trim().split(/\s+/)[0];

/* Distribuição de rotas: bairros como rotas, abertura dos pacotes, atribuição em um toque, em lote ou automática. */
export default function Rotas() {
  const S = useStore();
  const [data, setData] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [todas, setTodas] = useState(false);          // inclui paradas que já têm motorista
  const [sel, setSel] = useState(() => new Set());   // rotas marcadas
  const [aberta, setAberta] = useState(() => new Set());
  const [equipe, setEquipe] = useState(() => new Set());
  const [plano, setPlano] = useState(null);

  const rom = useMemo(() => new Map(S.romaneios.map((r) => [r.id, r])), [S.romaneios]);
  const datas = useMemo(() => [...new Set(S.paradas.filter((p) => p.status === 'pendente').map((p) => rom.get(p.romaneioId)?.data).filter(Boolean))].sort().reverse(), [S.paradas, rom]);
  const paradas = useMemo(() => S.paradas.filter((p) => {
    const r = rom.get(p.romaneioId);
    return r && p.status === 'pendente' && (todas || !p.motoristaId) && (!data || r.data === data) && (!empresaId || r.empresaId === empresaId);
  }), [S.paradas, rom, data, empresaId, todas]);
  const rotas = useMemo(() => agruparRotas(paradas), [paradas]);
  const comEmp = (p) => ({ id: p.id, empresaId: rom.get(p.romaneioId)?.empresaId, endereco: p.endereco, cliente: p.cliente, pacotes: p.pacotes });
  const casadas = useMemo(() => acharCasadas(paradas.map(comEmp), S.paradas.filter((p) => p.status === 'pendente').map(comEmp)), [paradas, S.paradas, rom]); // eslint-disable-line react-hooks/exhaustive-deps
  const nomeEmp = (id) => S.empresas.find((e) => e.id === id)?.nome || 'outro parceiro';
  const cidades = useMemo(() => [...new Set(rotas.map((r) => r.cidade))], [rotas]);
  const mot = (id) => S.motoristas.find((m) => m.id === id);
  const totalPac = rotas.reduce((t, r) => t + r.pacotes, 0);
  const ativos = S.motoristas.filter((m) => m.ativo !== false);

  const alterna = (set, setSet, k) => setSet((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const idsDe = (rs) => rs.flatMap((r) => r.paradas.map((p) => p.id));
  const dono = (r) => { const ids = [...new Set(r.paradas.map((p) => p.motoristaId || ''))]; return ids.length === 1 ? ids[0] : 'misto'; };
  const marcadas = rotas.filter((r) => sel.has(r.key));

  const calcular = () => {
    const ids = [...equipe].filter((id) => mot(id));
    if (!ids.length) return;
    const { atribuicao, cargas } = dividir(rotas, ids);
    setPlano({ atribuicao, cargas, ids });
  };
  const aplicar = () => {
    const por = {};
    for (const [pid, mid] of plano.atribuicao) (por[mid] ||= []).push(pid);
    for (const [mid, ids] of Object.entries(por)) act.atribuir(ids, mid);
    setPlano(null); setSel(new Set());
  };

  if (!S.paradas.some((p) => p.status === 'pendente')) return null;

  return (
    <div className="card">
      <h2>Distribuir rotas</h2>
      <p className="sub">Cada bairro é uma rota. Abra para ver as paradas e os pacotes, escolha o motorista em um toque, marque várias rotas de uma vez ou deixe o sistema dividir por igual.</p>

      <div className="form" style={{ marginBottom: 12 }}>
        <label className="f">Dia da rota<select className="sel" value={data} onChange={(e) => { setData(e.target.value); setSel(new Set()); setPlano(null); }}><option value="">Todos os dias</option>{datas.map((d) => <option key={d} value={d}>{dataBR(d)}</option>)}</select></label>
        <label className="f">Parceiro<select className="sel" value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setSel(new Set()); setPlano(null); }}><option value="">Todos</option>{S.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={todas} onChange={(e) => { setTodas(e.target.checked); setPlano(null); }} /> Mostrar também as já distribuídas</label>
      </div>

      {!rotas.length ? <p className="muted">{todas ? 'Nenhuma parada pendente neste filtro.' : 'Tudo distribuído neste filtro. 👏'}</p> : (<>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <b>{rotas.length} rota(s) · {num(paradas.length)} parada(s) · {num(totalPac)} pacote(s)</b>
          <div className="row">
            <button className="btn sm" onClick={() => setSel(new Set(rotas.map((r) => r.key)))}>Marcar todas</button>
            <button className="btn sm" onClick={() => setSel(new Set())} disabled={!sel.size}>Limpar</button>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface2)', marginTop: 12 }}>
          <p className="k-l">Dividir automaticamente</p>
          <p className="small muted" style={{ marginBottom: 8 }}>Escolha quem vai rodar. O sistema reparte {num(totalPac)} pacotes por igual, mantendo cada bairro junto (bairro muito grande é cortado por rua).</p>
          <div className="chips">{ativos.map((m) => (
            <button key={m.id} type="button" className={`chip${equipe.has(m.id) ? ' on' : ''}`} aria-pressed={equipe.has(m.id)} onClick={() => { alterna(equipe, setEquipe, m.id); setPlano(null); }}>{primeiroNome(m.nome)}</button>
          ))}</div>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" disabled={!equipe.size} onClick={calcular}>Calcular divisão</button>
            <button className="btn sm" onClick={() => { setEquipe(new Set(ativos.map((m) => m.id))); setPlano(null); }}>Todos</button>
          </div>
          {plano && (
            <div style={{ marginTop: 12 }}>
              <div className="list">{plano.ids.map((id) => (
                <div className="item" key={id} style={{ padding: '8px 2px' }}><b>{mot(id)?.nome}</b><span>{num(plano.cargas[id])} pacotes · {num([...plano.atribuicao.values()].filter((x) => x === id).length)} paradas</span></div>
              ))}</div>
              <div className="row" style={{ marginTop: 10 }}><button className="btn ac" onClick={aplicar}><Icon n="check" size={18} /> Aplicar divisão</button><button className="btn" onClick={() => setPlano(null)}>Cancelar</button></div>
            </div>
          )}
        </div>

        {marcadas.length > 0 && (
          <div className="card dest" style={{ marginTop: 12, padding: 14 }}>
            <p className="k-l">{marcadas.length} rota(s) marcada(s) · {num(marcadas.reduce((t, r) => t + r.pacotes, 0))} pacotes — atribuir a:</p>
            <div className="chips" style={{ marginTop: 6 }}>
              {ativos.map((m) => <button key={m.id} className="chip" onClick={() => { act.atribuir(idsDe(marcadas), m.id); setSel(new Set()); }}>{primeiroNome(m.nome)}</button>)}
              <button className="chip" onClick={() => { act.atribuir(idsDe(marcadas), null); setSel(new Set()); }}>Sem motorista</button>
            </div>
          </div>
        )}

        {cidades.map((c) => (
          <section key={c} style={{ marginTop: 18 }}>
            <p className="k-l"><b>{c}</b> · {rotas.filter((r) => r.cidade === c).length} rota(s)</p>
            {rotas.filter((r) => r.cidade === c).map((r) => {
              const d = dono(r), aberto = aberta.has(r.key);
              return (
                <div className="rota" key={r.key}>
                  <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <label className="row" style={{ gap: 10, cursor: 'pointer', flex: '1 1 220px' }}>
                      <input type="checkbox" checked={sel.has(r.key)} onChange={() => alterna(sel, setSel, r.key)} aria-label={`Marcar ${r.bairro}`} />
                      <span><b>{r.bairro}</b><span className="muted small" style={{ display: 'block' }}>{r.paradas.length} parada(s) · {r.pacotes} pacote(s){r.paradas.some((p) => casadas.has(p.id)) && ` · 🔗 ${r.paradas.filter((p) => casadas.has(p.id)).length} com outro parceiro`}</span></span>
                    </label>
                    <span className={`tag ${d === '' ? 'warn' : 'ok'}`}>{d === '' ? 'Sem motorista' : d === 'misto' ? 'Vários motoristas' : primeiroNome(mot(d)?.nome || '?')}</span>
                    <button className="btn sm" onClick={() => alterna(aberta, setAberta, r.key)} aria-expanded={aberto}>{aberto ? 'Fechar' : 'Abrir'} <Icon n="down" size={14} /></button>
                  </div>
                  <div className="chips" style={{ marginTop: 8 }}>
                    {ativos.map((m) => <button key={m.id} className={`chip${d === m.id ? ' on' : ''}`} onClick={() => act.atribuir(r.paradas.map((p) => p.id), m.id)}>{primeiroNome(m.nome)}</button>)}
                  </div>
                  {aberto && (
                    <div className="tbl-wrap" style={{ marginTop: 10 }}><table className="tbl"><thead><tr><th>Endereço</th><th>Destinatário</th><th>Pacotes</th><th>Motorista</th></tr></thead><tbody>
                      {[...r.paradas].sort((a, b) => a.endereco.localeCompare(b.endereco, 'pt', { numeric: true })).map((p) => (
                        <tr key={p.id}><td>{p.endereco}{casadas.get(p.id)?.map((o, i) => <span key={i} className={`tag ${o.mesmoCliente ? 'ok' : 'warn'}`} style={{ marginLeft: 6 }} title={`${o.cliente || ''} · ${o.pacotes.join(', ')}`}>🔗 {nomeEmp(o.empresaId)}</span>)}</td><td className="muted small">{p.cliente || '—'}</td>
                          <td className="small">{p.pacotes.map((c) => <div key={c}>{c}</div>)}</td>
                          <td><select className="sel" style={{ minWidth: 130 }} value={p.motoristaId || ''} onChange={(e) => act.atribuir([p.id], e.target.value || null)} aria-label={`Motorista de ${p.endereco}`}><option value="">Sem motorista</option>{ativos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></td></tr>
                      ))}
                    </tbody></table></div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </>)}
    </div>
  );
}
