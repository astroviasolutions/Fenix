import { useRef, useState } from 'react';
import { lerArquivo } from '../leitor/index.js';
import { num, planejarBaixa, STATUS, statusDoTexto } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Icon } from '../ui.jsx';

/* Baixa em lote: finaliza muitos pacotes de uma vez, por lista de códigos ou por planilha/PDF de status do parceiro. */
export default function BaixaLote() {
  const S = useStore();
  const [modo, setModo] = useState('codigos');
  const [txt, setTxt] = useState('');
  const [status, setStatus] = useState('entregue');
  const [arq, setArq] = useState(null);       // { nome, registros, temStatus }
  const [sobrescrever, setSobrescrever] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');
  const inp = useRef(null);

  const entradas = modo === 'codigos'
    ? txt.split(/[\s,;]+/).filter(Boolean).map((c) => ({ codigo: c, status }))
    : (arq?.registros || []).map((r) => ({ codigo: r.codigo, status: arq.temStatus ? statusDoTexto(r.status) || null : status })).filter((e) => e.status);
  const plano = entradas.length ? planejarBaixa(S, entradas, { sobrescrever }) : null;
  const porStatus = {};
  plano?.aplicar.forEach((a) => (porStatus[a.status] = (porStatus[a.status] || 0) + 1));

  async function receber(f) {
    setErro(''); setArq(null); setFeito('');
    if (!f) return;
    try {
      const r = await lerArquivo(f);
      const temStatus = r.registros.some((x) => x.status);
      if (!r.registros.some((x) => x.codigo)) throw new Error('Não achei a coluna de código/etiqueta neste arquivo.');
      setArq({ nome: f.name, registros: r.registros, temStatus });
    } catch (e) { setErro(e.message || 'Não consegui ler o arquivo.'); }
  }
  const aplicar = () => { act.baixarLote(plano.aplicar); setFeito(`${plano.aplicar.length} parada(s) atualizada(s).`); setTxt(''); setArq(null); };

  return (
    <div className="card">
      <h2>Baixa rápida em lote</h2>
      <p className="sub">Finalize muitos pacotes de uma vez: cole os códigos, ou traga a planilha/PDF de status do parceiro. Só mexe em paradas pendentes (a menos que você marque para sobrescrever).</p>
      <Chips valor={modo} onChange={(v) => { setModo(v); setFeito(''); }} opcoes={[['codigos', 'Colar códigos'], ['arquivo', 'Planilha / PDF de status']]} />
      <div className="stack" style={{ marginTop: 12 }}>
        {modo === 'codigos' ? (
          <label className="f">Códigos (um por linha, ou separados por espaço/vírgula)
            <textarea className="inp" rows={4} value={txt} onChange={(e) => { setTxt(e.target.value); setFeito(''); }} placeholder="TXAQ619558026tx&#10;TXAQ619943004tx" style={{ fontFamily: 'inherit' }} />
          </label>
        ) : (
          <div className="drop" role="button" tabIndex={0} onClick={() => inp.current.click()} onKeyDown={(e) => e.key === 'Enter' && inp.current.click()}>
            <Icon n="upload" size={26} /><p><b>{arq ? arq.nome : 'Solte a planilha ou PDF de status aqui'}</b></p>
            <p className="small muted">{arq ? `${num(arq.registros.length)} linha(s) · ${arq.temStatus ? 'com coluna de status' : 'sem coluna de status: escolha abaixo'}` : 'precisa ter a coluna do código; se tiver status (Entregue, Ausente…), o sistema entende'}</p>
            <input ref={inp} type="file" accept=".pdf,.xlsx,.xls,.csv" hidden onChange={(e) => { receber(e.target.files[0]); e.target.value = ''; }} />
          </div>
        )}
        {(modo === 'codigos' || (arq && !arq.temStatus)) && (
          <div><p className="k-l">Marcar todos como</p><Chips valor={status} onChange={setStatus} opcoes={Object.entries(STATUS).filter(([k]) => k !== 'pendente')} /></div>
        )}
        {erro && <p className="down" role="alert">{erro}</p>}
        {plano && (
          <div className="card" style={{ background: 'var(--surface2)', padding: 14 }}>
            <p><b>{num(plano.aplicar.length)}</b> parada(s) serão atualizadas{Object.keys(porStatus).length > 0 && <> ({Object.entries(porStatus).map(([k, n]) => `${n} ${STATUS[k].toLowerCase()}`).join(', ')})</>}.</p>
            {plano.naoAchados.length > 0 && <p className="small warn">⚠ {plano.naoAchados.length} código(s) não encontrado(s): {plano.naoAchados.slice(0, 5).join(', ')}{plano.naoAchados.length > 5 ? '…' : ''}</p>}
            {plano.jaBaixadas.length > 0 && <p className="small muted">{plano.jaBaixadas.length} já tinham baixa (ignoradas).</p>}
            {plano.parciais.length > 0 && <p className="small warn">⚠ {plano.parciais.length} parada(s) têm mais pacotes do que os códigos informados e foram ignoradas.</p>}
            <label className="row" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} /> <span className="small">Também sobrescrever paradas já baixadas</span></label>
            <div className="row" style={{ marginTop: 10 }}><button className="btn ac" disabled={!plano.aplicar.length} onClick={aplicar}><Icon n="check" size={18} /> Aplicar baixa</button></div>
          </div>
        )}
        {feito && <p className="up">{feito}</p>}
      </div>
    </div>
  );
}
