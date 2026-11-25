import { useEffect, useState } from 'react';

const K = 'fenix_tema';
const ler = () => (document.documentElement.getAttribute('data-theme') === 'claro' ? 'claro' : 'escuro');

export function useTema() {
  const [tema, setTema] = useState(ler);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'claro' ? '#f3f2ee' : '#000000');
    try { localStorage.setItem(K, tema); } catch { /* sem storage */ }
  }, [tema]);
  return [tema, () => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro'))];
}

/* A logo da Fenix é um disco preto: serve nos dois temas. */
export const logoCompleta = () => '/logo-square.webp';
export const logoRedonda = () => '/logo-round.webp';
