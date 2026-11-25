import { useEffect, useMemo, useRef, useState } from 'react';
import { act, useStore } from '../store.js';
import { Icon } from '../ui.jsx';

const MSG = {
  nao_achado: 'Código não encontrado em nenhuma carga.',
  outro_motorista: 'Este pacote está na carga de outro motorista.',
};

/* Bipagem do motorista: câmera do celular, leitor Bluetooth/pistola (que "digita" o código + Enter) ou digitação à mão. */
export default function Bipar({ motoristaId }) {
  const S = useStore();
  const [txt, setTxt] = useState('');
  const [log, setLog] = useState([]);       // últimos bips da sessão
  const [camera, setCamera] = useState(false);
  const [aviso, setAviso] = useState('');
  const video = useRef(null);
  const ultimo = useRef({ cod: '', t: 0 });

  const { total, bipados } = useMemo(() => {
    const minhas = S.paradas.filter((p) => p.motoristaId === motoristaId);
    return { total: minhas.reduce((t, p) => t + p.pacotes.length, 0), bipados: minhas.reduce((t, p) => t + Object.keys(p.bipados || {}).length, 0) };
  }, [S.paradas, motoristaId]);

  function registrar(codigo) {
    const cod = String(codigo).trim();
    if (!cod) return;
    const agora = Date.now();
    if (ultimo.current.cod === cod && agora - ultimo.current.t < 2500) return; // a câmera lê o mesmo código várias vezes
    ultimo.current = { cod, t: agora };
    const r = act.bipar(cod, motoristaId);
    const status = r.ok ? (r.repetido ? 'repetido' : 'ok') : 'erro';
    setLog((l) => [{ cod, status, txt: r.ok ? (r.repetido ? 'Já bipado' : r.parada.endereco) : MSG[r.motivo] }, ...l].slice(0, 12));
    setAviso(r.ok ? '' : MSG[r.motivo]);
    try { navigator.vibrate?.(r.ok ? 40 : [80, 60, 80]); } catch { /* sem vibração */ }
  }

  /* câmera */
  useEffect(() => {
    if (!camera) return undefined;
    let parar = false, stream = null, leitor = null, timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (parar) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream; await video.current.play();
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector();
          const loop = async () => { if (parar) return; try { const c = await det.detect(video.current); if (c[0]) registrar(c[0].rawValue); } catch { /* quadro sem código */ } timer = setTimeout(loop, 250); };
          loop();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          leitor = new BrowserMultiFormatReader();
          leitor.decodeFromStream(stream, video.current, (res) => { if (res) registrar(res.getText()); });
        }
      } catch { setAviso('Não consegui abrir a câmera. Libere a permissão no navegador ou use o campo abaixo.'); setCamera(false); }
    })();
    return () => { parar = true; clearTimeout(timer); try { leitor?.stop?.(); } catch { /* ok */ } stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <div className="card" style={{ padding: 16 }}>
        <p><b>{bipados}</b> de {total} pacotes bipados</p>
        <div className="prog"><i style={{ width: `${total ? (bipados / total) * 100 : 0}%` }} /></div>
      </div>
      <button className={`btn ${camera ? '' : 'ac'}`} onClick={() => setCamera(!camera)}><Icon n="scan" size={18} /> {camera ? 'Fechar câmera' : 'Bipar com a câmera'}</button>
      {camera && <div className="scan"><video ref={video} playsInline muted /><i /></div>}
      <form onSubmit={(e) => { e.preventDefault(); registrar(txt); setTxt(''); }}>
        <label className="f">Leitor Bluetooth ou digitar o código
          <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" autoCapitalize="characters" inputMode="text" placeholder="Bipe ou digite e dê Enter" />
        </label>
      </form>
      {aviso && <p className="down" role="alert">{aviso}</p>}
      <div className="list">
        {log.map((l, i) => (
          <div className="item" key={i} style={{ padding: '8px 2px' }}>
            <span><b>{l.cod}</b><span className="small muted" style={{ display: 'block' }}>{l.txt}</span></span>
            <span className={`tag ${l.status === 'ok' ? 'ok' : l.status === 'repetido' ? 'warn' : 'bad'}`}>{l.status === 'ok' ? 'Bipado' : l.status === 'repetido' ? 'Repetido' : 'Erro'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
