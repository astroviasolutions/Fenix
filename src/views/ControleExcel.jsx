import { useMemo, useRef, useState } from 'react';
import { exportarControle, lerBlocoColado, lerControle, matrizDoTexto } from '../controle.js';
import { agregarPacotes, brl, acertoQuinzena, dataBR, norm, num, quinzena } from '../lib.js';
import { act, getState, useStore } from '../store.js';
import { Icon, Modal } from '../ui.jsx';

/* Colar do Excel: o que ele faz hoje (copiar de uma planilha e colar), com o sistema entendendo cabeçalhos e datas. */
function Colar({ aberto, fechar, q, motId }) {
  const S = useStore();
  const [txt, setTxt] = useState('');
  const [mot, setMot] = useState(motId || '');
  const m = mot || motId || S.motoristas[0]?.id;
  const r = useMemo(() => (txt.trim() ? lerBlocoColado(matrizDoTexto(txt), S.empresas, q) : null), [txt, S.empresas, q]);
  const aplicar = () => { act.contarLote(r.itens.map((i) => ({ ...i, motoristaId: m }))); setTxt(''); fechar(); };
  return (
    <Modal aberto={aberto} fechar={fechar} titulo="Colar do Excel">
      <div className="stack">
        <p className="muted small">Copie no Excel o bloco (com ou sem a linha de nomes dos parceiros e a coluna de datas) e cole abaixo. Com cabeçalho, as colunas são reconhecidas pelo nome; sem cabeçalho, entram na ordem dos parceiros, a partir do dia {dataBR(q.ini)}.</p>
        <label className="f">Motorista<select className="sel" value={m} onChange={(e) => setMot(e.target.value)}>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <textarea className="inp" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Cole aqui (Ctrl+V)" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
        {r && (
          <p className={r.itens.length ? '' : 'down'}>{r.itens.length ? <><b>{r.itens.length}</b> valor(es) reconhecido(s), {num(r.itens.reduce((t, i) => t + i.qtd, 0))} pacotes. {r.cabecalho ? 'Cabeçalho reconhecido.' : 'Sem cabeçalho: colunas na ordem dos parceiros.'}{r.semParceiro > 0 && <span className="warn"> {r.semParceiro} coluna(s) com nome de parceiro não cadastrado foram ignoradas.</span>}</> : 'Não reconheci números neste texto.'}</p>
        )}
        <div className="row"><button className="btn ac" disabled={!r?.itens.length} onClick={aplicar}><Icon n="check" size={18} /> Aplicar</button><button className="btn" onClick={fechar}>Cancelar</button></div>
      </div>
    </Modal>
  );
}

/* Importa a planilha de controle inteira (uma aba por motorista) e confere se tudo bate com o que a planilha calculou. */
function Importar({ aberto, fechar }) {
  const S = useStore();
  const [abas, setAbas] = useState(null);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(null);
  const inp = useRef(null);

  async function receber(f) {
    setErro(''); setAbas(null); setFeito(null);
    if (!f) return;
    try {
      const a = (await lerControle(f)).filter((x) => !/^conf/i.test(x.nome));
      if (!a.length) throw new Error('Não achei abas de motorista (colunas DATA + parceiros) neste arquivo.');
      setAbas(a.map((x) => ({ ...x, usar: true })));
    } catch (e) { setErro(e.message || 'Não consegui ler a planilha.'); }
  }

  function importar() {
    const usar = abas.filter((a) => a.usar);
    const emp = new Map(getState().empresas.map((e) => [norm(e.nome), e.id]));
    const ensureEmp = (nome) => { const k = norm(nome); if (!emp.has(k)) emp.set(k, act.add('empresas', { nome: nome.trim().replace(/\s+/g, ' '), tarifa: 0, prazoDias: 1 })); return emp.get(k); };
    const itens = [], ids = {};
    for (const a of usar) {
      let mid = getState().motoristas.find((m) => norm(m.nome) === norm(a.nome))?.id;
      const porParceiro = {};
      for (const [pn, t] of Object.entries(a.taxas)) if (a.taxa && Math.abs(t - a.taxa) > 1e-9) porParceiro[ensureEmp(pn)] = Math.round(t * 100);
      if (!mid) mid = act.add('motoristas', { nome: a.nome.replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase()), tipo: 'pacote', valor: Math.round((a.taxa || 0) * 100), porParceiro, ativo: true });
      else { const m = getState().motoristas.find((x) => x.id === mid); act.upd('motoristas', mid, { porParceiro: { ...(m.porParceiro || {}), ...porParceiro }, valor: m.valor || Math.round((a.taxa || 0) * 100) }); }
      ids[a.nome] = mid;
      for (const l of a.lancamentos) itens.push({ data: l.data, motoristaId: mid, empresaId: ensureEmp(l.parceiro), qtd: l.qtd });
    }
    act.contarLote(itens);
    setFeito({ abas: usar, ids, total: itens.reduce((t, i) => t + i.qtd, 0) });
  }

  /* conferência: o que o sistema calcula × o que a planilha calculou, por motorista e quinzena */
  const conf = useMemo(() => {
    if (!feito) return null;
    return feito.abas.map((a) => {
      const m = S.motoristas.find((x) => x.id === feito.ids[a.nome]);
      const blocos = a.blocos.filter((b) => b.soma || b.pago).map((b) => {
        const q = quinzena(b.ini);
        const sis = agregarPacotes(S, { ini: q.ini, fim: q.fim, motoristaId: m?.id }).total;
        const pagoSis = m ? acertoQuinzena(S, m, q).bruto / 100 : 0;
        return { q, soma: b.soma, sis, pago: b.pago, pagoSis, ok: sis === b.soma && Math.abs(pagoSis - b.pago) < 0.011 };
      });
      return { nome: a.nome, blocos };
    });
  }, [feito, S]);

  return (
    <Modal aberto={aberto} fechar={() => { fechar(); setAbas(null); setFeito(null); }} titulo="Importar a planilha de controle">
      <div className="stack">
        {!abas && !feito && (
          <>
            <p className="muted small">Traga o arquivo do mês (ex.: <b>NOV_2026.xlsx</b>): uma aba por motorista, com DATA e uma coluna por parceiro. O sistema lê os números, cadastra o que faltar e <b>confere se bate</b> com os totais e o valor a pagar da própria planilha.</p>
            <div className="drop" role="button" tabIndex={0} onClick={() => inp.current.click()} onKeyDown={(e) => e.key === 'Enter' && inp.current.click()}>
              <Icon n="upload" size={26} /><p><b>Escolher a planilha (.xlsx)</b></p>
              <input ref={inp} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { receber(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </>
        )}
        {erro && <p className="down" role="alert">{erro}</p>}
        {abas && !feito && (
          <>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th /><th>Aba</th><th className="r">Lançamentos</th><th className="r">Pacotes</th><th className="r">Valor/pacote</th></tr></thead><tbody>
              {abas.map((a, i) => (
                <tr key={a.nome}><td><input type="checkbox" checked={a.usar} onChange={() => setAbas(abas.map((x, k) => (k === i ? { ...x, usar: !x.usar } : x)))} /></td>
                  <td><b>{a.nome}</b>{S.motoristas.some((m) => norm(m.nome) === norm(a.nome)) ? '' : <span className="tag warn" style={{ marginLeft: 8 }}>novo</span>}</td>
                  <td className="r">{a.lancamentos.length}</td><td className="r">{num(a.lancamentos.reduce((t, l) => t + l.qtd, 0))}</td><td className="r">{a.taxa ? brl(Math.round(a.taxa * 100)) : '—'}</td></tr>
              ))}
            </tbody></table></div>
            <p className="small muted">Parceiros que ainda não existem serão cadastrados (com “recebe por pacote” zerado; ajuste em Ajustes). Se uma coluna tem valor diferente do padrão do motorista (ex.: cartão a R$ 1,20), isso é guardado.</p>
            <div className="row"><button className="btn ac" disabled={!abas.some((a) => a.usar)} onClick={importar}><Icon n="check" size={18} /> Importar e conferir</button><button className="btn" onClick={() => setAbas(null)}>Voltar</button></div>
          </>
        )}
        {feito && conf && (
          <>
            <p><b>Importado:</b> {num(feito.total)} pacotes. Conferência com a planilha:</p>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Motorista</th><th>Quinzena</th><th className="r">Pacotes planilha</th><th className="r">Sistema</th><th className="r">Pago planilha</th><th className="r">Sistema</th><th /></tr></thead><tbody>
              {conf.flatMap((c) => c.blocos.map((b) => (
                <tr key={c.nome + b.q.ini}><td>{c.nome}</td><td className="small">{dataBR(b.q.ini).slice(0, 5)}–{dataBR(b.q.fim).slice(0, 5)}</td><td className="r">{num(b.soma)}</td><td className="r">{num(b.sis)}</td><td className="r">{brl(Math.round(b.pago * 100))}</td><td className="r">{brl(Math.round(b.pagoSis * 100))}</td><td>{b.ok ? <span className="up">✔ bate</span> : <span className="down">≠ diferença</span>}</td></tr>
              )))}
            </tbody></table></div>
            <div className="row"><button className="btn" onClick={() => { fechar(); setAbas(null); setFeito(null); }}>Fechar</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function Ferramentas({ q, motId }) {
  const [colar, setColar] = useState(false);
  const [imp, setImp] = useState(false);
  const S = useStore();
  return (
    <>
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <button className="btn sm" onClick={() => setColar(true)}><Icon n="upload" size={16} /> Colar do Excel</button>
        <button className="btn sm" onClick={() => setImp(true)}><Icon n="upload" size={16} /> Importar planilha de controle</button>
        <button className="btn sm" onClick={() => exportarControle(S, q.ini)}><Icon n="print" size={16} /> Exportar para Excel</button>
        <span className="small muted">Também dá para colar direto nas células: clique numa célula e use Ctrl+V.</span>
      </div>
      <Colar aberto={colar} fechar={() => setColar(false)} q={q} motId={motId} />
      <Importar aberto={imp} fechar={() => setImp(false)} />
    </>
  );
}
