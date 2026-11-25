import { useMemo, useRef, useState } from 'react';
import { acharCasadas } from '../casadas.js';
import { cidadeCanon, CIDADES_PR, ROTULOS, unificarCidades } from '../leitor/campos.js';
import { lerArquivo } from '../leitor/index.js';
import { dataBR, hoje, norm, num, STATUS } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Icon, Modal, Vazio } from '../ui.jsx';
import Rotas from './Rotas.jsx';

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
    const cidade = String(r.cidade || '').trim(), key = `${norm(r.endereco)}|${norm(cidade.replace(/\/.*$/, ''))}`;
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
  const [fin, setFin] = useState(null);   // romaneio que está sendo finalizado
  const [finSt, setFinSt] = useState('entregue');
  const [cidadePad, setCidadePad] = useState('');
  const [resp, setResp] = useState(null);       // resposta sobre o motorista do documento: 'doc' | 'outro' | 'depois'
  const inp = useRef(null);
  const emp = padrao || S.empresas[0]?.id || '';

  async function receber(file) {
    setErro(''); setLeitura(null); setResp(null); setCidadePad('');
    if (!file) return;
    setBusy(true);
    try {
      const r = await lerArquivo(file);
      setLeitura({ ...r, arquivo: file.name });
      setMot('');
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
    /* mesma cidade escrita de jeitos diferentes (Castro, castro, Castro-PR) vira uma grafia só, alinhada ao que já existe no sistema */
    const conhecidas = S.paradas.map((p) => p.cidade).filter(Boolean);
    let registros = unificarCidades(leitura.registros, conhecidas);
    /* arquivo sem cidade (ex.: Total): usa a escolhida; senão a única cidade do próprio arquivo; senão a mais usada no sistema */
    const doArquivo = [...new Set(registros.map((r) => r.cidade).filter(Boolean))];
    const maisUsadaSis = null; void maisUsadaSis;
    const freq = {}; conhecidas.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
    const maisUsada = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const fallback = cidadeCanon(cidadePad, conhecidas).texto || (doArquivo.length === 1 ? doArquivo[0] : '') || maisUsada;
    registros = registros.map((r) => (r.cidade ? r : { ...r, cidade: fallback }));
    for (const r of registros) {
      const e = (dividido && alvo[chaveServico(r)]) || emp;
      (porEmp.get(e) || porEmp.set(e, []).get(e)).push(r);
    }
    const grupos = [...porEmp.entries()].map(([empresaId, regs]) => ({ empresaId, ...agrupar(regs, jaTem) }));
    return { grupos, pacotes: grupos.reduce((t, g) => t + g.pacotes, 0), paradas: grupos.reduce((t, g) => t + g.paradas.length, 0), repetidos: grupos.reduce((t, g) => t + g.repetidos, 0) };
  }, [leitura, alvo, emp, jaTem, dividido, S.paradas, cidadePad]);
  const semCidade = leitura ? leitura.registros.filter((r) => !r.cidade).length : 0;

  /* destinatários que já têm entrega pendente de OUTRO parceiro */
  const casadas = useMemo(() => {
    if (!resumo) return [];
    const alvos = resumo.grupos.flatMap((g, gi) => g.paradas.map((p, pi) => ({ id: `${gi}-${pi}`, empresaId: g.empresaId, endereco: p.endereco, cliente: p.cliente, pacotes: p.pacotes })));
    const base = S.paradas.filter((p) => p.status === 'pendente').map((p) => ({ id: p.id, empresaId: S.romaneios.find((r) => r.id === p.romaneioId)?.empresaId, endereco: p.endereco, cliente: p.cliente, pacotes: p.pacotes }));
    const m = acharCasadas(alvos, base);
    return alvos.filter((a) => m.has(a.id)).map((a) => ({ ...a, outros: m.get(a.id) }));
  }, [resumo, S.paradas, S.romaneios]);
  const nomeEmp = (id) => S.empresas.find((e) => e.id === id)?.nome || 'outro parceiro';

  const docNome = leitura?.motoristaDoc ? leitura.motoristaDoc.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : '';
  const docId = leitura?.motoristaDoc ? acharMotorista(S, leitura.motoristaDoc) : '';
  const pendente = !!leitura?.motoristaDoc && resp === null;   // o dono precisa responder antes de importar
  const confirmar = () => {
    let motoristaId = resp === 'doc' ? docId : resp === 'outro' ? mot : '';
    if (resp === 'doc' && !docId) motoristaId = act.add('motoristas', { nome: docNome, tipo: 'pacote', valor: 0, ativo: true });
    if (!leitura.motoristaDoc) motoristaId = mot;
    act.importar({ data, arquivo: leitura.arquivo, motoristaId: motoristaId || null, grupos: resumo.grupos.filter((g) => g.paradas.length).map((g) => ({ empresaId: g.empresaId, paradas: g.paradas })) });
    setLeitura(null);
  };

  /* ---- lançar à mão ---- */
  const [m, setM] = useState({ codigo: '', endereco: '', bairro: '', cidade: '', cliente: '', motoristaId: '' });
  const [ok, setOk] = useState('');
  const lancar = () => {
    act.importar({ data, arquivo: 'lançamento manual', motoristaId: m.motoristaId || null, grupos: [{ empresaId: emp, paradas: [{ endereco: m.endereco.trim(), bairro: m.bairro.trim(), cidade: cidadeCanon(m.cidade, S.paradas.map((p) => p.cidade)).texto, cliente: m.cliente.trim(), pacotes: [m.codigo.trim() || `MANUAL-${Date.now().toString(36)}`], gps: null }] }] });
    setM({ ...m, codigo: '', endereco: '', cliente: '' }); setOk('Parada lançada.'); setTimeout(() => setOk(''), 2500);
  };

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
          {semCidade > 0 && (
            <label className="f" style={{ marginTop: 10, maxWidth: 360 }}>Cidade ({semCidade} pacote(s) sem cidade no arquivo)
              <input className="inp" list="cidades-pr" value={cidadePad} onChange={(e) => setCidadePad(e.target.value)} placeholder="Ex.: Castro" />
              <datalist id="cidades-pr">{CIDADES_PR.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          )}
          {casadas.length > 0 && (
            <details style={{ marginTop: 10 }} open>
              <summary style={{ cursor: 'pointer' }}><b>🔗 {casadas.length} endereço(s) já têm entrega de outro parceiro</b> <span className="muted small">· o motorista leva junto na mesma parada</span></summary>
              <div className="list small">{casadas.slice(0, 10).map((c) => (
                <div className="item" key={c.id} style={{ padding: '8px 2px' }}>
                  <span><b>{c.cliente || 'Sem nome'}</b> · {c.endereco}</span>
                  <span>{c.outros.map((o, i) => <span key={i} className={`tag ${o.mesmoCliente ? 'ok' : 'warn'}`} style={{ marginLeft: 6 }}>{nomeEmp(o.empresaId)} · {o.mesmoCliente ? 'mesmo cliente' : 'mesmo endereço'}</span>)}</span>
                </div>
              ))}{casadas.length > 10 && <p className="muted">e mais {casadas.length - 10}…</p>}</div>
            </details>
          )}

          {leitura.motoristaDoc ? (
            <div className="card" style={{ background: 'var(--surface2)', marginTop: 14, padding: 16 }}>
              <p><b>Este romaneio vem em nome de {docNome}.</b> {docId ? 'Seguir com esse motorista?' : 'Ele ainda não está cadastrado. Seguir com ele?'}</p>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button className={`btn ${resp === 'doc' ? 'ac' : ''}`} onClick={() => setResp('doc')}>{docId ? `Sim, seguir com ${docNome.split(' ')[0]}` : `Cadastrar ${docNome.split(' ')[0]} e seguir`}</button>
                <button className={`btn ${resp === 'outro' ? 'ac' : ''}`} onClick={() => setResp('outro')}>Escolher outro motorista</button>
                <button className={`btn ${resp === 'depois' ? 'ac' : ''}`} onClick={() => setResp('depois')}>Distribuir depois</button>
              </div>
              {resp === 'outro' && <label className="f" style={{ marginTop: 10 }}>Motorista<select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Escolher…</option>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>}
            </div>
          ) : (
            <div className="form" style={{ marginTop: 14 }}>
              <label className="f">Motorista desta carga
                <select className="sel" value={mot} onChange={(e) => setMot(e.target.value)}><option value="">Distribuir depois</option>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
            </div>
          )}

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
          <div className="row" style={{ marginTop: 16 }}><button className="btn dark" disabled={!resumo.pacotes || pendente || (resp === 'outro' && !mot)} title={pendente ? 'Responda sobre o motorista acima' : ''} onClick={confirmar}><Icon n="check" size={18} /> Importar {num(resumo.pacotes)} pacotes</button><button className="btn" onClick={() => setLeitura(null)}>Cancelar</button></div>
        </div>
      )}

      <Rotas />

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
      </div>

      <div className="card">
        <h2>Cargas importadas</h2>
        {!romaneios.length ? <Vazio titulo="Nenhuma carga" texto="Importe o primeiro romaneio para começar." /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Data</th><th>Parceiro</th><th>Arquivo</th><th className="r">Paradas</th><th className="r">Pacotes</th><th>Situação</th><th /></tr></thead><tbody>
            {romaneios.slice(0, 60).map((r) => {
              const ps = S.paradas.filter((p) => p.romaneioId === r.id);
              return (<tr key={r.id}><td>{dataBR(r.data)}</td><td>{S.empresas.find((e) => e.id === r.empresaId)?.nome || '—'}</td><td className="muted small">{r.arquivo}</td><td className="r">{ps.length}</td><td className="r">{ps.reduce((t, p) => t + p.pacotes.length, 0)}</td>
                <td><button className="chip" onClick={() => (r.finalizado ? act.upd('romaneios', r.id, { finalizado: false }) : (setFinSt('entregue'), setFin(r.id)))} title={r.finalizado ? 'Reabrir' : 'Finalizar'}>{r.finalizado ? 'Finalizado' : `Em andamento · ${ps.filter((p) => p.status === 'pendente').length} pendente(s)`}</button></td>
                <td className="r"><button className="btn sm danger" onClick={() => window.confirm('Excluir esta carga e todas as paradas dela?') && act.excluirRomaneio(r.id)}>Excluir</button></td></tr>);
            })}
          </tbody></table></div>
        )}
      </div>

      <Modal aberto={!!fin} fechar={() => setFin(null)} titulo="Finalizar esta carga">
        {fin && (() => {
          const pend = S.paradas.filter((p) => p.romaneioId === fin && p.status === 'pendente');
          const pac = pend.reduce((t, p) => t + p.pacotes.length, 0);
          return (
            <div className="stack">
              {pend.length ? <p>Ainda há <b>{pend.length} parada(s)</b> ({pac} pacotes) pendentes. O que fazer com elas?</p> : <p>Todas as paradas já foram baixadas.</p>}
              {pend.length > 0 && <div><p className="k-l">Marcar os pendentes como</p><Chips valor={finSt} onChange={setFinSt} opcoes={Object.entries(STATUS).filter(([k]) => k !== 'pendente')} /></div>}
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn ac" onClick={() => { act.finalizarRomaneio(fin, pend.length ? finSt : null); setFin(null); }}><Icon n="check" size={18} /> {pend.length ? `Finalizar e marcar ${pend.length} como ${STATUS[finSt].toLowerCase()}` : 'Finalizar'}</button>
                {pend.length > 0 && <button className="btn" onClick={() => { act.finalizarRomaneio(fin, null); setFin(null); }}>Finalizar deixando pendentes</button>}
                <button className="btn" onClick={() => setFin(null)}>Cancelar</button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
