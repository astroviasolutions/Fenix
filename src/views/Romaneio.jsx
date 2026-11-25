import { useMemo, useRef, useState } from 'react';
import { ROTULOS } from '../leitor/campos.js';
import { lerArquivo } from '../leitor/index.js';
import { dataBR, hoje, norm, num } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Icon, Vazio } from '../ui.jsx';

const FONTES = { tabela: 'Tabela em PDF', blocos: 'Fichas por entrega', ctrc: 'Romaneio de transportadora', planilha: 'Planilha' };
const chaveServico = (r) => String(r.servico || r.tipo || '').toUpperCase();

/* Agrupa pacotes pelo mesmo endereço (ignora "Rua"/"R.", acentos, maiúsculas, "nº") e remove repetidos. */
function agrupar(registros, jaTem) {
  const vistos = new Set(), grupos = new Map();
  let repetidos = 0;
  for (const r of registros) {
    const cod = String(r.codigo || '').trim();
    if (!cod || !r.endereco) continue;
    if (vistos.has(cod.toLowerCase()) || jaTem.has(cod.toLowerCase())) { repetidos++; continue; }
    vistos.add(cod.toLowerCase());
    const cidade = String(r.cidade || '').replace(/\/.*$/, '').trim(), key = `${norm(r.endereco)}|${norm(cidade)}`;
    let g = grupos.get(key);
    if (!g) { g = { endereco: r.endereco, bairro: r.bairro || '', cidade, cliente: r.cliente || '', cep: r.cep || '', pacotes: [], gps: null }; grupos.set(key, g); }
    g.pacotes.push(cod);
  }
  return { paradas: [...grupos.values()], repetidos, pacotes: vistos.size };
}

const acharMotorista = (S, nome) => {
  const n = norm(nome); if (!n) return '';
  return S.motoristas.find((m) => { const x = norm(m.nome); return x === n || n.includes(x) || x.includes(n); })?.id || '';
};

export default function Romaneio() {
  const S = useStore();
  const [data, setData] = useState(hoje());
  const [leitura, setLeitura] = useState(null);   // resultado do leitor
  const [alvo, setAlvo] = useState({});           // serviço → parceiro
  const [padrao, setPadrao] = useState('');
  const [mot, setMot] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [novaEmp, setNovaEmp] = useState('');
  const [aba, setAba] = useState('arquivo');
  const inp = useRef(null);
  const emp = padrao || S.empresas[0]?.id || '';

  async function receber(file) {
    setErro(''); setLeitura(null);
    if (!file) return;
    setBusy(true);
    try {
      const r = await lerArquivo(file);
      setLeitura({ ...r, arquivo: file.name });
      setMot(acharMotorista(S, r.motoristaDoc));
      /* serviços diferentes (ex.: cartão) já tentam cair no parceiro de mesmo nome */
      const m = {};
      for (const v of new Set(r.registros.map(chaveServico).filter(Boolean))) {
        const e = S.empresas.find((x) => norm(x.nome).includes(norm(v === 'CAR' ? 'cartao' : v)) || norm(v === 'CAR' ? 'cartao' : v).includes(norm(x.nome)));
        if (e) m[v] = e.id;
      }
      setAlvo(m);
    } catch (e) { setErro(e.message || 'Não consegui ler esse arquivo.'); }
    setBusy(false);
  }
  const remapear = (indice, campo) => {
    const mapa = {};
    leitura.colunas.forEach((c) => { if (c.campo) mapa[c.indice] = c.campo; });
    if (campo) mapa[indice] = campo; else delete mapa[indice];
    const r = leitura.reprocessar(mapa);
    if (r) setLeitura({ ...leitura, ...r });
  };

  const jaTem = useMemo(() => new Set(S.paradas.flatMap((p) => p.pacotes.map((c) => c.toLowerCase()))), [S.paradas]);
  const servicos = useMemo(() => (leitura ? [...new Set(leitura.registros.map(chaveServico).filter(Boolean))] : []), [leitura]);
  const dividido = servicos.length > 1;
  const resumo = useMemo(() => {
    if (!leitura) return null;
    const porEmp = new Map();
    for (const r of leitura.registros) {
      const e = (dividido && alvo[chaveServico(r)]) || emp;
      (porEmp.get(e) || porEmp.set(e, []).get(e)).push(r);
    }
    const grupos = [...porEmp.entries()].map(([empresaId, regs]) => ({ empresaId, ...agrupar(regs, jaTem) }));
    return { grupos, pacotes: grupos.reduce((t, g) => t + g.pacotes, 0), paradas: grupos.reduce((t, g) => t + g.paradas.length, 0), repetidos: grupos.reduce((t, g) => t + g.repetidos, 0) };
  }, [leitura, alvo, emp, jaTem, dividido]);

  const confirmar = () => {
    act.importar({ data, arquivo: leitura.arquivo, motoristaId: mot || null, grupos: resumo.grupos.filter((g) => g.paradas.length).map((g) => ({ empresaId: g.empresaId, paradas: g.paradas })) });
    setLeitura(null);
  };

  /* ---- lançar à mão ---- */
  const [m, setM] = useState({ codigo: '', endereco: '', bairro: '', cidade: '', cliente: '', motoristaId: '' });
  const [ok, setOk] = useState('');
  const lancar = () => {
    act.importar({ data, arquivo: 'lançamento manual', motoristaId: m.motoristaId || null, grupos: [{ empresaId: emp, paradas: [{ endereco: m.endereco.trim(), bairro: m.bairro.trim(), cidade: m.cidade.trim(), cliente: m.cliente.trim(), pacotes: [m.codigo.trim() || `MANUAL-${Date.now().toString(36)}`], gps: null }] }] });
    setM({ ...m, codigo: '', endereco: '', cliente: '' }); setOk('Parada lançada.'); setTimeout(() => setOk(''), 2500);
  };

  const semMot = useMemo(() => {
    const x = {};
    for (const p of S.paradas) if (!p.motoristaId && p.status === 'pendente') x[p.cidade || 'Sem cidade'] = (x[p.cidade || 'Sem cidade'] || 0) + 1;
    return Object.entries(x).sort((a, b) => b[1] - a[1]);
  }, [S.paradas]);
  const romaneios = useMemo(() => [...S.romaneios].sort((a, b) => b.data.localeCompare(a.data)), [S.romaneios]);

  return (
    <div className="stack">
      <div className="card">
        <h2>1. Traga a carga do parceiro</h2>
        <p className="sub">Solte o romaneio em <b>PDF, Excel ou CSV</b>, de qualquer parceiro. O sistema reconhece as colunas, corrige acentos e nomes quebrados, junta os pacotes do mesmo endereço e confere o total. Se não reconhecer algo, você ajusta uma vez.</p>
        {!S.empresas.length ? (
          <div className="form">
            <label className="f">Cadastre o primeiro parceiro<input className="inp" placeholder="Ex.: Total Express" value={novaEmp} onChange={(e) => setNovaEmp(e.target.value)} /></label>
            <button className="btn ac" disabled={!novaEmp.trim()} onClick={() => { act.add('empresas', { nome: novaEmp.trim(), tarifa: 0, prazoDias: 1 }); setNovaEmp(''); }}><Icon n="plus" size={18} /> Cadastrar parceiro</button>
          </div>
        ) : (
          <div className="stack">
            <Chips valor={aba} onChange={setAba} opcoes={[['arquivo', 'Importar arquivo'], ['mao', 'Lançar à mão']]} />
            <div className="form">
              <label className="f">Parceiro<select className="sel" value={emp} onChange={(e) => setPadrao(e.target.value)}>{S.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
              <label className="f">Data da rota<input className="inp" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
            </div>
            {aba === 'arquivo' ? (
              <div className={`drop${arrastando ? ' on' : ''}`} role="button" tabIndex={0} aria-busy={busy}
                onClick={() => inp.current.click()} onKeyDown={(e) => e.key === 'Enter' && inp.current.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files[0]); }}>
                <Icon n="upload" size={30} /><p><b>{busy ? 'Lendo o arquivo…' : 'Solte o arquivo aqui ou toque para escolher'}</b></p><p className="small muted">.pdf, .xlsx, .xls ou .csv</p>
                <input ref={inp} type="file" accept=".pdf,.xlsx,.xls,.csv" hidden onChange={(e) => { receber(e.target.files[0]); e.target.value = ''; }} />
              </div>
            ) : (
              <div className="stack">
                <div className="form">
                  <label className="f">Código / etiqueta (opcional)<input className="inp" value={m.codigo} onChange={(e) => setM({ ...m, codigo: e.target.value })} /></label>
                  <label className="f" style={{ flex: '2 1 260px' }}>Endereço<input className="inp" value={m.endereco} onChange={(e) => setM({ ...m, endereco: e.target.value })} /></label>
                  <label className="f">Bairro<input className="inp" value={m.bairro} onChange={(e) => setM({ ...m, bairro: e.target.value })} /></label>
                  <label className="f">Cidade<input className="inp" value={m.cidade} onChange={(e) => setM({ ...m, cidade: e.target.value })} /></label>
                  <label className="f">Destinatário<input className="inp" value={m.cliente} onChange={(e) => setM({ ...m, cliente: e.target.value })} /></label>
                  <label className="f">Motorista<select className="sel" value={m.motoristaId} onChange={(e) => setM({ ...m, motoristaId: e.target.value })}><option value="">Sem motorista</option>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                </div>
                <div className="row"><button className="btn ac" disabled={!m.endereco.trim()} onClick={lancar}><Icon n="plus" size={18} /> Lançar parada</button>{ok && <span className="up">{ok}</span>}</div>
                <p className="small muted">Para só informar quantos pacotes cada motorista levou no dia, use a aba <b>Contagem</b>: é mais rápido e não precisa de endereço.</p>
              </div>
            )}
          </div>
        )}
        {erro && <p className="down" role="alert" style={{ marginTop: 12 }}>{erro}</p>}
      </div>

      {leitura && resumo && (
        <div className="card dest">
          <h2>2. Conferir antes de importar</h2>
          <p className="sub">{leitura.arquivo} · lido como <b>{FONTES[leitura.fonte] || leitura.fonte}</b></p>
          <div className="grid g4">
            <div><div className="k-v">{num(resumo.pacotes)}</div><div className="k-s">pacotes únicos{leitura.esperado != null && <> · o documento informa {num(leitura.esperado)}</>}</div></div>
            <div><div className="k-v">{num(resumo.paradas)}</div><div className="k-s">paradas (agrupadas por endereço)</div></div>
            <div><div className="k-v">{num(resumo.repetidos)}</div><div className="k-s">já existiam ou repetidos</div></div>
            <div><div className="k-v">{leitura.registros.filter((r) => !r.endereco || !r.codigo).length}</div><div className="k-s">sem código ou endereço (ignorados)</div></div>
          </div>
          {leitura.avisos?.map((a) => <p key={a} className="small warn" style={{ marginTop: 10 }}>⚠ {a}</p>)}

          <div className="form" style={{ marginTop: 14 }}>
            <label className="f">Motorista desta carga{leitura.motoristaDoc ? ` (no documento: ${leitura.motoristaDoc})` : ''}
              <select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Distribuir depois</option>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          </div>

          {dividido && (
            <div style={{ marginTop: 14 }}>
              <p className="k-l">Este arquivo tem mais de um tipo de serviço. Em qual parceiro cada um entra?</p>
              <div className="list">{servicos.map((v) => (
                <div className="item" key={v}><span><b>{v}</b> <span className="muted">· {leitura.registros.filter((r) => chaveServico(r) === v).length} pacote(s)</span></span>
                  <select className="sel" style={{ width: 200 }} value={alvo[v] || emp} onChange={(e) => setAlvo({ ...alvo, [v]: e.target.value })}>{S.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
              ))}</div>
            </div>
          )}

          {leitura.colunas?.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer' }}><b>Colunas reconhecidas</b> <span className="muted small">· errou alguma? corrija aqui</span></summary>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Coluna do arquivo</th><th>Exemplo</th><th>O que é</th></tr></thead><tbody>
                {leitura.colunas.map((c) => (
                  <tr key={c.indice}><td>{c.rotulo || '—'}</td><td className="muted small">{c.amostra.join(' · ')}</td>
                    <td><select className="sel" value={c.campo || ''} onChange={(e) => remapear(c.indice, e.target.value)}><option value="">Ignorar</option>{Object.entries(ROTULOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>
                ))}
              </tbody></table></div>
            </details>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer' }}><b>Prévia dos primeiros pacotes</b></summary>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Código</th><th>Destinatário</th><th>Endereço</th><th>Cidade</th></tr></thead><tbody>
              {leitura.registros.slice(0, 8).map((r, i) => <tr key={i}><td>{r.codigo}</td><td>{r.cliente}</td><td>{r.endereco}</td><td>{r.cidade}</td></tr>)}
            </tbody></table></div>
          </details>
          <div className="row" style={{ marginTop: 16 }}><button className="btn dark" disabled={!resumo.pacotes} onClick={confirmar}><Icon n="check" size={18} /> Importar {num(resumo.pacotes)} pacotes</button><button className="btn" onClick={() => setLeitura(null)}>Cancelar</button></div>
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <h2>Como o leitor trabalha</h2>
          <div className="list small">
            <div className="item"><span><b>Acha as colunas sozinho.</b> Pelo nome (AWB, Destinatário, Address, Consignee…) ou, se o nome estiver quebrado, pelo conteúdo (CEP, telefone, endereço).</span></div>
            <div className="item"><span><b>Corrige o que vem errado.</b> Acentos quebrados, “Castro/RP”, endereço em formato “Estado, Cidade, Bairro, Rua”.</span></div>
            <div className="item"><span><b>Confere o total.</b> Se o documento diz 106 e o leitor achou 101, avisa antes de importar.</span></div>
            <div className="item"><span><b>Junta pelo mesmo endereço</b> e ignora pacotes repetidos.</span></div>
          </div>
        </div>
        <div className="card">
          <h2>Distribuir rotas</h2>
          <p className="sub">Paradas pendentes sem motorista, por cidade.</p>
          {!semMot.length ? <p className="muted">Nenhuma parada sem motorista.</p> : semMot.map(([c, n]) => (
            <div className="item" key={c}>
              <span><b>{c}</b> <span className="muted">· {n} parada(s)</span></span>
              <select className="sel" style={{ width: 190 }} defaultValue="" onChange={(e) => e.target.value && act.distribuir(c, e.target.value)} aria-label={`Motorista para ${c}`}>
                <option value="">Escolher motorista…</option>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Cargas importadas</h2>
        {!romaneios.length ? <Vazio titulo="Nenhuma carga" texto="Importe o primeiro romaneio para começar." /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Data</th><th>Parceiro</th><th>Arquivo</th><th className="r">Paradas</th><th className="r">Pacotes</th><th>Situação</th><th /></tr></thead><tbody>
            {romaneios.slice(0, 60).map((r) => {
              const ps = S.paradas.filter((p) => p.romaneioId === r.id);
              return (<tr key={r.id}><td>{dataBR(r.data)}</td><td>{S.empresas.find((e) => e.id === r.empresaId)?.nome || '—'}</td><td className="muted small">{r.arquivo}</td><td className="r">{ps.length}</td><td className="r">{ps.reduce((t, p) => t + p.pacotes.length, 0)}</td>
                <td><button className="chip" onClick={() => act.upd('romaneios', r.id, { finalizado: !r.finalizado })}>{r.finalizado ? 'Finalizado' : 'Em andamento'}</button></td>
                <td className="r"><button className="btn sm danger" onClick={() => window.confirm('Excluir esta carga e todas as paradas dela?') && act.excluirRomaneio(r.id)}>Excluir</button></td></tr>);
            })}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
