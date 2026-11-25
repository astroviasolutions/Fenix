import { useMemo, useState } from 'react';
import { agregarPacotes, brl, dataBR, hoje, num, pct, quinzena, quinzenaSeguinte, resultadoQuinzena, rotuloMes, shiftMes } from '../lib.js';
import { gerarPdf } from '../pdf.js';
import { act, useStore } from '../store.js';
import { Icon, Vazio } from '../ui.jsx';

const Linha = ({ nome, valor, sub, neg }) => (
  <div className="item" style={{ padding: '9px 2px' }}><span>{nome}{sub && <span className="muted small"> · {sub}</span>}</span><b className={neg ? 'down' : ''}>{neg ? '− ' : ''}{brl(valor)}</b></div>
);

function Coluna({ r }) {
  return (
    <div className="card">
      <div className="k-l">{dataBR(r.q.ini)} a {dataBR(r.q.fim)}</div>
      <div className="k-v" style={{ color: r.saldo >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{brl(r.saldo)}</div>
      <div className="k-s">sobra da quinzena</div>
      {r.semTarifa && <p className="small warn" style={{ marginTop: 8 }}>Há parceiro sem “recebe por pacote” em Ajustes: a entrada está subestimada.</p>}
      {r.divergencias > 0 && <p className="small warn" style={{ marginTop: 8 }}>{r.divergencias} lançamento(s) diferem do que foi bipado. Veja em Contagem.</p>}
      <h3 className="sec">Entradas</h3>
      <div className="list">{r.entradas.map((x) => <Linha key={x.id} nome={x.nome} sub={`${num(x.qtd)} pacotes`} valor={x.valor} />)}
        {!r.entradas.length && <p className="muted small">Sem pacotes lançados.</p>}</div>
      <Linha nome={<b>Total de entradas</b>} valor={r.receita} />
      <h3 className="sec">Saídas</h3>
      <div className="list">
        {r.motoristas.map((m) => <Linha key={m.id} nome={m.nome} sub={`${num(m.acerto.pacotes)} pacotes`} valor={m.acerto.bruto} neg />)}
        {r.fixas.map((f) => <Linha key={f.id} nome={f.nome} sub="fixa" valor={f.valor} neg />)}
        {r.comb > 0 && <Linha nome="Combustível" valor={r.comb} neg />}
        {r.impostos > 0 && <Linha nome="Impostos" sub={pct(r.impostos / (r.receita || 1))} valor={r.impostos} neg />}
      </div>
    </div>
  );
}

/* Conferência com o parceiro: o que NÓS lançamos × o que o parceiro diz que entregou/vai pagar. */
function Conferencia({ q }) {
  const S = useStore();
  const u = useMemo(() => agregarPacotes(S, { ini: q.ini, fim: q.fim }), [S, q]);
  const linhas = S.empresas.filter((e) => u.porEmpresa[e.id] || S.conferencias.some((c) => c.ini === q.ini && c.empresaId === e.id));
  if (!linhas.length) return null;
  return (
    <div className="card">
      <h2>Conferência com os parceiros</h2>
      <p className="sub">Compare o que você lançou com o número que o parceiro informa. A diferença, depois do ajuste, é o que falta acertar.</p>
      <div className="tbl-wrap"><table className="tbl grade"><thead><tr><th>Parceiro</th><th className="r">Lançado</th><th className="r">Informado pelo parceiro</th><th className="r">Diferença</th><th className="r">Ajuste</th><th className="r">Falta</th></tr></thead><tbody>
        {linhas.map((e) => {
          const c = S.conferencias.find((x) => x.ini === q.ini && x.empresaId === e.id);
          const lanc = u.porEmpresa[e.id] || 0, inf = c?.informado ?? null, aj = c?.ajuste || 0;
          const dif = inf == null ? null : inf - lanc;
          const num_ = (v) => (v === '' ? null : parseInt(v, 10));
          return (<tr key={e.id}><td><b>{e.nome}</b></td><td className="r">{num(lanc)}</td>
            <td className="r"><input className="cel" inputMode="numeric" key={`i${inf}`} defaultValue={inf ?? ''} onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()} onBlur={(ev) => { const n = num_(ev.target.value.trim()); if (n !== inf && !Number.isNaN(n)) act.conferir(q.ini, e.id, { informado: n }); }} /></td>
            <td className={`r ${dif ? (dif > 0 ? 'up' : 'down') : ''}`}>{dif == null ? '—' : (dif > 0 ? '+' : '') + num(dif)}</td>
            <td className="r"><input className="cel" inputMode="numeric" key={`a${aj}`} defaultValue={aj || ''} onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()} onBlur={(ev) => { const n = parseInt(ev.target.value.trim() || '0', 10); if (n !== aj && !Number.isNaN(n)) act.conferir(q.ini, e.id, { ajuste: n }); }} /></td>
            <td className="r"><b>{dif == null ? '—' : (dif - aj === 0 ? <span className="up">ok</span> : num(dif - aj))}</b></td></tr>);
        })}
      </tbody></table></div>
    </div>
  );
}

export default function Resultado() {
  const S = useStore();
  const [q, setQ] = useState(() => quinzena(hoje()));
  const q1 = useMemo(() => quinzena(q.ini.slice(0, 8) + '01'), [q]);
  const q2 = useMemo(() => quinzenaSeguinte(q1), [q1]);
  const [r1, r2] = useMemo(() => [resultadoQuinzena(S, q1), resultadoQuinzena(S, q2)], [S, q1, q2]);
  const mes = r1.saldo + r2.saldo;
  const vazio = !r1.receita && !r2.receita && !r1.custoMot && !r2.custoMot;

  const pdf = () => gerarPdf({
    titulo: 'Resultado do mês', subtitulo: `${dataBR(q1.ini)} a ${dataBR(q2.fim)}`, arquivo: `resultado-${q1.ini.slice(0, 7)}.pdf`,
    resumo: [['Entradas', brl(r1.receita + r2.receita)], ['Motoristas', brl(r1.custoMot + r2.custoMot)], ['Fixas', brl(r1.custoFixas + r2.custoFixas)], ['Combustível', brl(r1.comb + r2.comb)], ['Impostos', brl(r1.impostos + r2.impostos)], ['Resultado do mês', brl(mes)]],
    colunas: ['Quinzena', 'Entradas', 'Motoristas', 'Fixas', 'Combustível', 'Impostos', 'Sobra'],
    linhas: [r1, r2].map((r) => [`${dataBR(r.q.ini).slice(0, 5)} a ${dataBR(r.q.fim).slice(0, 5)}`, brl(r.receita), brl(r.custoMot), brl(r.custoFixas), brl(r.comb), brl(r.impostos), brl(r.saldo)]),
  });

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row">
            <button className="btn icon" onClick={() => setQ(quinzena(shiftMes(q1.ini, -1)))} aria-label="Mês anterior"><Icon n="left" /></button>
            <b style={{ font: 'italic 800 24px var(--f1)' }}>{rotuloMes(q1.ini)}</b>
            <button className="btn icon" onClick={() => setQ(quinzena(shiftMes(q1.ini, 1)))} aria-label="Próximo mês"><Icon n="right" /></button>
          </div>
          <div className="row"><div style={{ textAlign: 'right' }}><div className="k-l">Resultado do mês</div><b style={{ font: 'italic 800 28px var(--f1)', color: mes >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{brl(mes)}</b></div>
            <button className="btn" onClick={pdf}><Icon n="print" size={18} /> PDF</button></div>
        </div>
      </div>
      {vazio ? <div className="card"><Vazio titulo="Sem movimento neste mês" texto="O resultado aparece quando houver pacotes lançados em Contagem ou bipados pelos motoristas." /></div> : (
        <div className="grid g2"><Coluna r={r1} /><Coluna r={r2} /></div>
      )}
      <Conferencia q={q1} />
      <Conferencia q={q2} />
    </div>
  );
}
