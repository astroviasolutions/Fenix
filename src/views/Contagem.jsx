import { useMemo, useState } from 'react';
import { addDias, brl, dataBR, hoje, num, pacotesPeriodo, quinzena, quinzenaAnterior, quinzenaSeguinte, valorMotorista } from '../lib.js';
import { act, useStore } from '../store.js';
import { Chips, Icon, Vazio } from '../ui.jsx';
import { matrizDoTexto, numeroOuNulo } from '../controle.js';
import { Ferramentas } from './ControleExcel.jsx';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (d) => DIAS[new Date(d + 'T12:00:00').getDay()];
const lista = (ini, fim) => { const r = []; for (let d = ini; d <= fim; d = addDias(d, 1)) r.push(d); return r; };

/* Célula numérica estilo Excel: setas e Enter navegam, colar um bloco copiado do Excel preenche várias células.
   Vazio apaga o lançamento (volta a valer o cálculo automático). */
function Cel({ valor, bipado, diverge, onSave, onPaste, r, c }) {
  const foca = (dr, dc) => document.querySelector(`.cel[data-r="${r + dr}"][data-c="${c + dc}"]`)?.focus();
  return (
    <input className={`cel${diverge ? ' diverge' : ''}`} inputMode="numeric" data-r={r} data-c={c} key={`${valor}-${bipado}`} defaultValue={valor ?? ''} placeholder={bipado ? String(bipado) : ''}
      title={diverge ? `Digitado ${valor}; cálculo automático: ${bipado}` : bipado ? `${bipado} pelo cálculo automático` : ''}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        const mv = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
        if (mv) { e.preventDefault(); e.currentTarget.blur(); foca(...mv); }
      }}
      onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\t\n]/.test(t.trim())) { e.preventDefault(); onPaste(r, c, matrizDoTexto(t)); } }}
      onBlur={(e) => { const t = e.target.value.trim(); const n = t === '' ? null : numeroOuNulo(t); if (n !== (valor ?? null) && !(t !== '' && n === null)) onSave(n); else e.target.value = valor ?? ''; }} />
  );
}

/* Substitui a planilha de controle: pacotes por dia, motorista e parceiro. */
export default function Contagem() {
  const S = useStore();
  const [q, setQ] = useState(() => quinzena(hoje()));
  const [modo, setModo] = useState('motorista');
  const [motId, setMotId] = useState('');
  const [dia, setDia] = useState(hoje());
  const mot = S.motoristas.find((m) => m.id === motId) || S.motoristas[0];

  const dados = useMemo(() => {
    const m = new Map();
    for (const x of pacotesPeriodo(S, { ini: q.ini, fim: q.fim })) m.set(`${x.data}|${x.motoristaId}|${x.empresaId}`, x);
    return m;
  }, [S, q]);
  const get = (d, m, e) => dados.get(`${d}|${m}|${e}`);

  if (!S.motoristas.length || !S.empresas.length) {
    return <div className="card"><Vazio titulo="Cadastre motoristas e parceiros" texto="A contagem cruza motorista × parceiro. Cadastre os dois em Ajustes para começar a lançar.">
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn ac" onClick={() => act.carregarDemo()}>Ver com dados fictícios</button></div></Vazio></div>;
  }

  const dias = lista(q.ini, q.fim);
  const emps = S.empresas;
  /* colar um bloco do Excel a partir da célula clicada: linhas = dias (ou motoristas), colunas = parceiros */
  const colarMot = (r0, c0, mx) => act.contarLote(mx.flatMap((linha, i) => linha.flatMap((cel, j) => { const n = numeroOuNulo(cel); const d = dias[r0 + i], e = emps[c0 + j]; return n == null || !d || !e ? [] : [{ data: d, motoristaId: mot.id, empresaId: e.id, qtd: n }]; })));
  const colarDia = (d, r0, c0, mx) => act.contarLote(mx.flatMap((linha, i) => linha.flatMap((cel, j) => { const n = numeroOuNulo(cel); const m = S.motoristas[r0 + i], e = emps[c0 + j]; return n == null || !m || !e ? [] : [{ data: d, motoristaId: m.id, empresaId: e.id, qtd: n }]; })));

  /* ---- por motorista: uma "aba" da planilha ---- */
  const porMotorista = () => {
    const tot = emps.map((e) => dias.reduce((t, d) => t + (get(d, mot.id, e.id)?.qtd || 0), 0));
    const soma = tot.reduce((a, b) => a + b, 0);
    const v = valorMotorista(S, mot);
    return (
      <div className="card">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <Chips valor={mot.id} onChange={setMotId} opcoes={S.motoristas.map((m) => [m.id, m.nome])} />
        </div>
        <div className="tbl-wrap"><table className="tbl grade"><thead><tr><th>Data</th>{emps.map((e) => <th key={e.id} className="r">{e.nome}</th>)}<th className="r">Dia</th></tr></thead><tbody>
          {dias.map((d, ri) => {
            const linha = emps.map((e) => get(d, mot.id, e.id));
            return (<tr key={d} className={d === hoje() ? 'hoje' : ''}><td><b>{dataBR(d).slice(0, 5)}</b> <span className="muted small">{diaSemana(d)}</span></td>
              {emps.map((e, i) => <td key={e.id} className="r"><Cel r={ri} c={i} onPaste={colarMot} valor={linha[i]?.manual} bipado={linha[i]?.bipado} diverge={linha[i]?.diverge} onSave={(n) => act.contar(d, mot.id, e.id, n)} /></td>)}
              <td className="r"><b>{num(linha.reduce((t, x) => t + (x?.qtd || 0), 0)) || ''}</b></td></tr>);
          })}
        </tbody><tfoot>
          <tr><td>Total</td>{tot.map((t, i) => <td key={i} className="r">{num(t)}</td>)}<td className="r">{num(soma)}</td></tr>
          <tr className="ac"><td>× {mot.tipo === 'fixo' ? 'fixo mensal' : brl(v)}</td>{tot.map((t, i) => <td key={i} className="r">{mot.tipo === 'fixo' ? '' : brl(t * v)}</td>)}<td className="r">{mot.tipo === 'fixo' ? brl(Math.round(mot.valor / 2)) : brl(soma * v)}</td></tr>
        </tfoot></table></div>
        <p className="small muted" style={{ marginTop: 10 }}>Número em cinza = calculado automaticamente (rotas e entregas). Digitar só para corrigir. Célula laranja = o que você digitou difere do cálculo automático.</p>
      </div>
    );
  };

  /* ---- por dia: todos os motoristas de uma vez (lançamento do começo do dia) ---- */
  const porDia = () => {
    const d = dia < q.ini || dia > q.fim ? q.ini : dia;
    const totE = emps.map((e) => S.motoristas.reduce((t, m) => t + (get(d, m.id, e.id)?.qtd || 0), 0));
    return (
      <div className="card">
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <label className="f">Dia<input className="inp" type="date" min={q.ini} max={q.fim} value={d} onChange={(e) => setDia(e.target.value)} /></label>
        </div>
        <div className="tbl-wrap"><table className="tbl grade"><thead><tr><th>Motorista</th>{emps.map((e) => <th key={e.id} className="r">{e.nome}</th>)}<th className="r">Total</th></tr></thead><tbody>
          {S.motoristas.map((m, ri) => {
            const linha = emps.map((e) => get(d, m.id, e.id));
            return (<tr key={m.id}><td><b>{m.nome}</b></td>
              {emps.map((e, i) => <td key={e.id} className="r"><Cel r={ri} c={i} onPaste={(r0, c0, mx) => colarDia(d, r0, c0, mx)} valor={linha[i]?.manual} bipado={linha[i]?.bipado} diverge={linha[i]?.diverge} onSave={(n) => act.contar(d, m.id, e.id, n)} /></td>)}
              <td className="r"><b>{num(linha.reduce((t, x) => t + (x?.qtd || 0), 0)) || ''}</b></td></tr>);
          })}
        </tbody><tfoot><tr><td>Total do dia</td>{totE.map((t, i) => <td key={i} className="r">{num(t)}</td>)}<td className="r">{num(totE.reduce((a, b) => a + b, 0))}</td></tr></tfoot></table></div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row">
            <button className="btn icon" onClick={() => setQ(quinzenaAnterior(q))} aria-label="Quinzena anterior"><Icon n="left" /></button>
            <b style={{ font: 'italic 800 24px var(--f1)' }}>{dataBR(q.ini)} a {dataBR(q.fim)}</b>
            <button className="btn icon" onClick={() => setQ(quinzenaSeguinte(q))} aria-label="Próxima quinzena"><Icon n="right" /></button>
          </div>
          <Chips valor={modo} onChange={setModo} opcoes={[['motorista', 'Por motorista'], ['dia', 'Por dia']]} />
        </div>
        <Ferramentas q={q} motId={mot?.id} />
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <span className="small muted">O número em cinza vem <b>sozinho</b> das rotas distribuídas e das entregas. Digite só para corrigir ou para parceiro sem romaneio (ex.: cartão).</span>
          <span className="small muted">Contar por:</span>
          <Chips valor={S.ajustes.contarPor || 'entregue'} onChange={(v) => act.ajustes({ contarPor: v })} opcoes={[['entregue', 'Entregues'], ['carga', 'Carga distribuída']]} />
        </div>
      </div>
      {modo === 'motorista' ? porMotorista() : porDia()}
    </div>
  );
}
