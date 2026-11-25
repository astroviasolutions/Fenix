import { useState } from 'react';
import { brl, uid } from '../lib.js';
import { act, getState, useStore } from '../store.js';
import { Icon, Money } from '../ui.jsx';

/* grava só ao sair do campo (evita regravar a cada tecla) */
const Texto = ({ valor, onSave, ...r }) => <input className="inp" defaultValue={valor} key={valor} onBlur={(e) => e.target.value.trim() && e.target.value !== valor && onSave(e.target.value.trim())} {...r} />;

export default function Ajustes() {
  const S = useStore();
  const [m, setM] = useState({ nome: '', tipo: 'pacote', valor: 0 });
  const [e, setE] = useState({ nome: '', tarifa: 0, prazoDias: 1 });
  const [cat, setCat] = useState('');
  const [fx, setFx] = useState({ nome: '', valor: 0 });
  const [carregando, setCarregando] = useState(false);

  const backup = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' }));
    a.download = `fenix-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <div className="card">
        <h2>Motoristas</h2>
        <p className="sub">Quanto cada um recebe. Fixos têm salário mensal (a quinzena paga metade). Os demais recebem por pacote entregue; deixe em branco para usar o valor padrão.</p>
        <div className="list">
          {S.motoristas.map((x) => (
            <div className="item" key={x.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 200px' }}>Nome<Texto valor={x.nome} onSave={(v) => act.upd('motoristas', x.id, { nome: v })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Tipo<select className="sel" value={x.tipo} onChange={(ev) => act.upd('motoristas', x.id, { tipo: ev.target.value })}><option value="pacote">Por pacote</option><option value="fixo">Fixo (mensal)</option></select></label>
              <label className="f" style={{ flex: '1 1 130px' }}>{x.tipo === 'fixo' ? 'Salário mensal' : 'Por pacote'}<Money valor={x.valor} onChange={(v) => act.upd('motoristas', x.id, { valor: v })} /></label>
              <button className="btn sm danger" onClick={() => window.confirm(`Remover ${x.nome}? As paradas dele ficam sem motorista.`) && (act.del('motoristas', x.id), S.paradas.filter((p) => p.motoristaId === x.id).forEach((p) => act.upd('paradas', p.id, { motoristaId: null })))} aria-label={`Remover ${x.nome}`}><Icon n="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="f">Novo motorista<input className="inp" value={m.nome} onChange={(ev) => setM({ ...m, nome: ev.target.value })} /></label>
          <label className="f">Tipo<select className="sel" value={m.tipo} onChange={(ev) => setM({ ...m, tipo: ev.target.value })}><option value="pacote">Por pacote</option><option value="fixo">Fixo (mensal)</option></select></label>
          <label className="f">{m.tipo === 'fixo' ? 'Salário mensal' : 'Por pacote'}<Money live valor={m.valor} onChange={(v) => setM({ ...m, valor: v })} /></label>
          <button className="btn ac" disabled={!m.nome.trim()} onClick={() => { act.add('motoristas', { nome: m.nome.trim(), tipo: m.tipo, valor: m.valor, ativo: true }); setM({ nome: '', tipo: 'pacote', valor: 0 }); }}><Icon n="plus" size={18} /> Adicionar</button>
        </div>
      </div>

      <div className="card">
        <h2>Valores e prazos</h2>
        <label className="f" style={{ maxWidth: 320, marginBottom: 14 }}>Contagem automática de pacotes
          <select className="sel" value={S.ajustes.contarPor || 'entregue'} onChange={(ev) => act.ajustes({ contarPor: ev.target.value })}><option value="entregue">Só os entregues (baixados)</option><option value="carga">Toda a carga distribuída ao motorista</option></select></label>
        <label className="f" style={{ maxWidth: 320 }}>Valor padrão por pacote entregue (motoristas)<Money valor={S.ajustes.valorPadrao} onChange={(v) => act.ajustes({ valorPadrao: v })} /></label>
        <h2 style={{ marginTop: 24 }}>Parceiros ({S.empresas.length})</h2>
        <p className="sub">“Recebe por pacote” é o valor que o parceiro paga à Fenix. Sem ele, entradas e resultado não aparecem. Serviços separados, como o cartão da Total, entram como um parceiro à parte. O prazo diz em quantos dias a entrega ainda conta como no prazo.</p>
        <div className="list">
          {S.empresas.map((x) => (
            <div className="item" key={x.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 180px' }}>Nome<Texto valor={x.nome} onSave={(v) => act.upd('empresas', x.id, { nome: v })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Recebe por pacote<Money valor={x.tarifa} onChange={(v) => act.upd('empresas', x.id, { tarifa: v })} /></label>
              <label className="f" style={{ flex: '1 1 100px' }}>Prazo (dias)<input className="inp" type="number" min="0" max="30" value={x.prazoDias} onChange={(ev) => act.upd('empresas', x.id, { prazoDias: Math.max(0, Number(ev.target.value) || 0) })} /></label>
              <button className="btn sm danger" disabled={S.romaneios.some((r) => r.empresaId === x.id)} title={S.romaneios.some((r) => r.empresaId === x.id) ? 'Tem romaneios importados' : ''} onClick={() => act.del('empresas', x.id)} aria-label={`Remover ${x.nome}`}><Icon n="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="f">Novo parceiro<input className="inp" value={e.nome} onChange={(ev) => setE({ ...e, nome: ev.target.value })} /></label>
          <label className="f">Recebe por pacote<Money live valor={e.tarifa} onChange={(v) => setE({ ...e, tarifa: v })} /></label>
          <label className="f">Prazo (dias)<input className="inp" type="number" min="0" max="30" value={e.prazoDias} onChange={(ev) => setE({ ...e, prazoDias: Number(ev.target.value) || 0 })} /></label>
          <button className="btn ac" disabled={!e.nome.trim()} onClick={() => { act.add('empresas', { nome: e.nome.trim(), tarifa: e.tarifa, prazoDias: e.prazoDias }); setE({ nome: '', tarifa: 0, prazoDias: 1 }); }}><Icon n="plus" size={18} /> Cadastrar</button>
        </div>
      </div>

      <div className="card">
        <h2>Fixas e impostos</h2>
        <p className="sub">Entram no Resultado: as fixas são descontadas uma vez por mês (na 1ª quinzena); o imposto é um percentual sobre as entradas.</p>
        <label className="f" style={{ maxWidth: 220 }}>Imposto sobre as entradas (%)<input className="inp" type="number" min="0" max="60" step="0.5" value={(S.ajustes.impostoPct || 0) * 100 || ''} onChange={(ev) => act.ajustes({ impostoPct: Math.min(Math.max(Number(ev.target.value) || 0, 0), 60) / 100 })} /></label>
        <div className="list" style={{ marginTop: 12 }}>
          {(S.ajustes.fixas || []).map((f) => (
            <div className="item" key={f.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 200px' }}>Despesa fixa<Texto valor={f.nome} onSave={(v) => act.ajustes({ fixas: S.ajustes.fixas.map((x) => (x.id === f.id ? { ...x, nome: v } : x)) })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Valor mensal<Money valor={f.valor} onChange={(v) => act.ajustes({ fixas: S.ajustes.fixas.map((x) => (x.id === f.id ? { ...x, valor: v } : x)) })} /></label>
              <button className="btn sm danger" onClick={() => act.ajustes({ fixas: S.ajustes.fixas.filter((x) => x.id !== f.id) })} aria-label={`Remover ${f.nome}`}><Icon n="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="f">Nova despesa fixa<input className="inp" value={fx.nome} onChange={(ev) => setFx({ ...fx, nome: ev.target.value })} placeholder="Ex.: aluguel, parcela, internet" /></label>
          <label className="f">Valor mensal<Money live valor={fx.valor} onChange={(v) => setFx({ ...fx, valor: v })} /></label>
          <button className="btn ac" disabled={!fx.nome.trim() || fx.valor <= 0} onClick={() => { act.ajustes({ fixas: [...(S.ajustes.fixas || []), { id: uid(), nome: fx.nome.trim(), valor: fx.valor }] }); setFx({ nome: '', valor: 0 }); }}><Icon n="plus" size={18} /> Adicionar</button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Meta do mês</h2>
          <p className="sub">Meta de pacotes entregues por mês. Vale para todos os meses até você mudar.</p>
          <label className="f" style={{ maxWidth: 220 }}>Pacotes por mês<input className="inp" type="number" min="0" value={S.ajustes.meta || ''} onChange={(ev) => act.ajustes({ meta: Math.max(0, Number(ev.target.value) || 0) })} /></label>
        </div>
        <div className="card">
          <h2>Categorias do caixa</h2>
          <p className="sub">Crie as suas além das que já vêm prontas.</p>
          <div className="chips">{S.ajustes.categorias.map((c) => <button key={c} className="chip" onClick={() => act.ajustes({ categorias: S.ajustes.categorias.filter((x) => x !== c) })} title="Remover">{c} ✕</button>)}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <input className="inp" style={{ flex: 1 }} placeholder="Nova categoria" value={cat} onChange={(ev) => setCat(ev.target.value)} />
            <button className="btn" disabled={!cat.trim()} onClick={() => { act.ajustes({ categorias: [...new Set([...S.ajustes.categorias, cat.trim()])] }); setCat(''); }}>Adicionar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Dados</h2>
        <p className="sub">Hoje os dados ficam só neste navegador. Faça backup antes de limpar o navegador. Quando o Supabase for conectado, tudo passa a ficar na nuvem.</p>
        <div className="row">
          <button className="btn" onClick={backup}>Baixar backup (JSON)</button>
          <button className="btn" disabled={carregando} onClick={async () => { if (!S.romaneios.length || window.confirm('Isso substitui tudo pelos dados fictícios. Continuar?')) { setCarregando(true); await act.carregarDemo(); setCarregando(false); } }}>Carregar dados fictícios</button>
          <button className="btn danger" onClick={() => window.confirm('Apagar TODOS os dados deste navegador? Isso não pode ser desfeito.') && act.limpar()}>Apagar tudo</button>
        </div>
        {S.demo && <p className="small warn" style={{ marginTop: 10 }}>Os dados atuais são fictícios de demonstração ({brl(S.ajustes.saldoInicial)} de saldo inicial é inventado).</p>}
      </div>
    </div>
  );
}
