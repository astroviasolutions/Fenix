import { useEffect, useMemo, useRef, useState } from 'react';
import { tituloBR } from '../leitor/campos.js';
import { classificar, exportarControle, lerBlocoColado, matrizDoTexto } from '../controle.js';
import { acertoQuinzena, agregarPacotes, brl, dataBR, norm, num, quinzena, uid } from '../lib.js';
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

/* Importa QUALQUER planilha do cliente: reconhece sozinho se é a de controle (aba por motorista), a da Total (QTD./CARTÃO)
   ou a FENIX (fixas e imposto) e puxa tudo o que o sistema precisa. */
export function ImportarPlanilha({ aberto, fechar, arquivoInicial }) {
  const S = useStore();
  const [res, setRes] = useState(null);       // resultado de classificar()
  const [abas, setAbas] = useState(null);     // controle: com checkbox
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(null);
  const [busy, setBusy] = useState(false);
  const inp = useRef(null);
  const ultimo = useRef(null);

  async function receber(f) {
    setErro(''); setRes(null); setAbas(null); setFeito(null);
    if (!f) return;
    setBusy(true);
    try {
      const r = await classificar(f);
      if (r.tipo === 'desconhecido') throw new Error('Não reconheci esta planilha. Ela precisa ter abas por motorista (coluna DATA + parceiros), ou ser a TOTAL (QTD./CARTÃO) ou a FENIX (ENTRADAS/FIXAS).');
      setRes(r);
      if (r.tipo === 'controle') setAbas(r.abas.map((x) => ({ ...x, usar: true })));
    } catch (e) { setErro(e.message || 'Não consegui ler a planilha.'); }
    setBusy(false);
  }
  useEffect(() => { if (aberto && arquivoInicial && ultimo.current !== arquivoInicial) { ultimo.current = arquivoInicial; receber(arquivoInicial); } }, [aberto, arquivoInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const achaEmp = (est, nome, extra = []) => { const k = norm(nome); return est.empresas.find((e) => norm(e.nome) === k || extra.some((x) => norm(e.nome).includes(x))); };
  const garanteEmp = (nome, extra = []) => achaEmp(getState(), nome, extra)?.id || act.add('empresas', { nome, tarifa: 0, prazoDias: 1 });

  function importarControle() {
    const usar = abas.filter((a) => a.usar);
    const emp = new Map(getState().empresas.map((e) => [norm(e.nome), e.id]));
    const ensureEmp = (nome) => { const k = norm(nome); if (!emp.has(k)) emp.set(k, act.add('empresas', { nome: nome.trim().replace(/\s+/g, ' '), tarifa: 0, prazoDias: 1 })); return emp.get(k); };
    const itens = [], ids = {};
    for (const a of usar) {
      let mid = getState().motoristas.find((m) => norm(m.nome) === norm(a.nome))?.id;
      const porParceiro = {};
      for (const [pn, t] of Object.entries(a.taxas)) if (a.taxa && Math.abs(t - a.taxa) > 1e-9) porParceiro[ensureEmp(pn)] = Math.round(t * 100);
      if (!mid) mid = act.add('motoristas', { nome: tituloBR(a.nome.replace(/\s+/g, ' ').trim()), tipo: 'pacote', valor: Math.round((a.taxa || 0) * 100), porParceiro, ativo: true });
      else { const m = getState().motoristas.find((x) => x.id === mid); act.upd('motoristas', mid, { porParceiro: { ...(m.porParceiro || {}), ...porParceiro }, valor: m.valor || Math.round((a.taxa || 0) * 100) }); }
      ids[a.nome] = mid;
      for (const l of a.lancamentos) itens.push({ data: l.data, motoristaId: mid, empresaId: ensureEmp(l.parceiro), qtd: l.qtd });
    }
    act.contarLote(itens);
    setFeito({ tipo: 'controle', abas: usar, ids, total: itens.reduce((t, i) => t + i.qtd, 0) });
  }

  function importarTotal() {
    const idT = garanteEmp('Total', ['total']), idC = garanteEmp('Cartão', ['cartao']);
    if (res.tarifa) act.upd('empresas', idT, { tarifa: Math.round(res.tarifa * 100) });
    if (res.tarifaCartao) act.upd('empresas', idC, { tarifa: Math.round(res.tarifaCartao * 100) });
    for (const x of res.informado) { act.conferir(x.ini, idT, { informado: x.qtd }); if (x.cartao) act.conferir(x.ini, idC, { informado: x.cartao }); }
    setFeito({ tipo: 'total', n: res.informado.length });
  }

  function importarFenix() {
    const atuais = getState().ajustes.fixas || [];
    const nomes = new Set(res.fixas.map((f) => norm(f.nome)));
    const fixas = [...atuais.filter((f) => !nomes.has(norm(f.nome))), ...res.fixas.map((f) => ({ id: atuais.find((a) => norm(a.nome) === norm(f.nome))?.id || uid(), nome: f.nome.replace(/\s+/g, ' '), valor: f.valor }))];
    act.ajustes({ fixas, ...(res.impostoPct != null ? { impostoPct: res.impostoPct } : {}) });
    setFeito({ tipo: 'fenix', n: res.fixas.length });
  }

  /* conferência da planilha de controle: sistema × planilha, por motorista e quinzena */
  const conf = useMemo(() => {
    if (!feito || feito.tipo !== 'controle') return null;
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

  const sair = () => { fechar(); setRes(null); setAbas(null); setFeito(null); setErro(''); ultimo.current = null; };

  return (
    <Modal aberto={aberto} fechar={sair} titulo="Importar planilha do cliente">
      <div className="stack">
        {!res && !feito && (
          <>
            <p className="muted small">Traga qualquer planilha dele: a de <b>controle do mês</b> (ex.: NOV_2026.xlsx, uma aba por motorista), a <b>TOTAL_2026</b> (QTD. e CARTÃO) ou a <b>FENIX_2026</b> (fixas e imposto). O sistema reconhece qual é, puxa o que precisa e confere se bate.</p>
            <div className="drop" role="button" tabIndex={0} aria-busy={busy} onClick={() => inp.current.click()} onKeyDown={(e) => e.key === 'Enter' && inp.current.click()}>
              <Icon n="upload" size={26} /><p><b>{busy ? 'Lendo a planilha…' : 'Escolher a planilha (.xlsx)'}</b></p>
              <input ref={inp} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { receber(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </>
        )}
        {erro && <p className="down" role="alert">{erro}</p>}

        {res?.tipo === 'controle' && abas && !feito && (
          <>
            <p><b>Planilha de controle</b> · {abas.length} aba(s) de motorista</p>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th /><th>Aba</th><th className="r">Lançamentos</th><th className="r">Pacotes</th><th className="r">Valor/pacote</th></tr></thead><tbody>
              {abas.map((a, i) => (
                <tr key={a.nome}><td><input type="checkbox" checked={a.usar} onChange={() => setAbas(abas.map((x, k) => (k === i ? { ...x, usar: !x.usar } : x)))} /></td>
                  <td><b>{a.nome}</b>{S.motoristas.some((m) => norm(m.nome) === norm(a.nome)) ? '' : <span className="tag warn" style={{ marginLeft: 8 }}>novo</span>}</td>
                  <td className="r">{a.lancamentos.length}</td><td className="r">{num(a.lancamentos.reduce((t, l) => t + l.qtd, 0))}</td><td className="r">{a.taxa ? brl(Math.round(a.taxa * 100)) : '—'}</td></tr>
              ))}
            </tbody></table></div>
            <p className="small muted">Motoristas e parceiros que ainda não existem serão cadastrados. Valor diferente por coluna (ex.: cartão a R$ 1,20) é guardado.</p>
            <div className="row"><button className="btn ac" disabled={!abas.some((a) => a.usar)} onClick={importarControle}><Icon n="check" size={18} /> Importar e conferir</button><button className="btn" onClick={() => { setRes(null); setAbas(null); }}>Voltar</button></div>
          </>
        )}

        {res?.tipo === 'total' && !feito && (
          <>
            <p><b>Planilha da Total</b> · contagem informada por quinzena</p>
            <p className="small">Tarifa: <b>{res.tarifa ? brl(Math.round(res.tarifa * 100)) : '—'}</b> por pacote · <b>{res.tarifaCartao ? brl(Math.round(res.tarifaCartao * 100)) : '—'}</b> por cartão</p>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Quinzena</th><th>Mês</th><th className="r">QTD.</th><th className="r">CARTÃO</th></tr></thead><tbody>
              {res.informado.map((x) => <tr key={x.ini}><td>{dataBR(x.ini)}</td><td>{x.mes}</td><td className="r">{num(x.qtd)}</td><td className="r">{num(x.cartao)}</td></tr>)}
            </tbody></table></div>
            <p className="small muted">Isso vira o “informado pelo parceiro” na Conferência (Resultado) e ajusta o “recebe por pacote” de Total e Cartão.</p>
            <div className="row"><button className="btn ac" onClick={importarTotal}><Icon n="check" size={18} /> Importar</button><button className="btn" onClick={() => setRes(null)}>Voltar</button></div>
          </>
        )}

        {res?.tipo === 'fenix' && !feito && (
          <>
            <p><b>Planilha FENIX</b> · despesas fixas (aba {res.mes}) e imposto</p>
            <div className="list">{res.fixas.map((f) => <div className="item" key={f.nome} style={{ padding: '6px 2px' }}><span>{f.nome}</span><b>{brl(f.valor)}</b></div>)}</div>
            <p className="small">Imposto sobre as entradas: <b>{res.impostoPct != null ? `${(res.impostoPct * 100).toLocaleString('pt-BR')}%` : 'não encontrado'}</b></p>
            <div className="row"><button className="btn ac" disabled={!res.fixas.length && res.impostoPct == null} onClick={importarFenix}><Icon n="check" size={18} /> Importar</button><button className="btn" onClick={() => setRes(null)}>Voltar</button></div>
          </>
        )}

        {feito?.tipo === 'controle' && conf && (
          <>
            <p><b>Importado:</b> {num(feito.total)} pacotes. Conferência com a planilha:</p>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Motorista</th><th>Quinzena</th><th className="r">Pacotes planilha</th><th className="r">Sistema</th><th className="r">Pago planilha</th><th className="r">Sistema</th><th /></tr></thead><tbody>
              {conf.flatMap((c) => c.blocos.map((b) => (
                <tr key={c.nome + b.q.ini}><td>{c.nome}</td><td className="small">{dataBR(b.q.ini).slice(0, 5)}–{dataBR(b.q.fim).slice(0, 5)}</td><td className="r">{num(b.soma)}</td><td className="r">{num(b.sis)}</td><td className="r">{brl(Math.round(b.pago * 100))}</td><td className="r">{brl(Math.round(b.pagoSis * 100))}</td><td>{b.ok ? <span className="up">✔ bate</span> : <span className="down">≠ diferença</span>}</td></tr>
              )))}
            </tbody></table></div>
            <div className="row"><button className="btn" onClick={sair}>Fechar</button></div>
          </>
        )}
        {feito && feito.tipo !== 'controle' && (
          <><p className="up"><b>Pronto.</b> {feito.tipo === 'total' ? `${feito.n} quinzena(s) importada(s) para a conferência e tarifas atualizadas.` : `${feito.n} despesa(s) fixa(s) e o imposto foram importados.`}</p><div className="row"><button className="btn" onClick={sair}>Fechar</button></div></>
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
        <button className="btn sm" onClick={() => setImp(true)}><Icon n="upload" size={16} /> Importar planilha do cliente</button>
        <button className="btn sm" onClick={() => exportarControle(S, q.ini)}><Icon n="print" size={16} /> Exportar para Excel</button>
        <span className="small muted">Também dá para colar direto nas células: clique numa célula e use Ctrl+V.</span>
      </div>
      <Colar aberto={colar} fechar={() => setColar(false)} q={q} motId={motId} />
      <ImportarPlanilha aberto={imp} fechar={() => setImp(false)} />
    </>
  );
}
