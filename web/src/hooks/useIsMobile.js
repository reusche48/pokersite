import { useEffect, useState } from 'react';

// True para celulares (ancho < bp) y también para tablets en VERTICAL
// (portrait hasta 1024px): así usan el layout compacto y nadie queda cortado.
// En horizontal (landscape) las tablets siguen con el óvalo panorámico.
function computeMobile(bp) {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isPortrait = h >= w;
  // Celular (ancho < bp) o CUALQUIER pantalla en vertical → layout compacto.
  // Solo horizontal ancho (landscape) usa el óvalo panorámico.
  return w < bp || isPortrait;
}

export function useIsMobile(bp = 768) {
  const [isMobile, setIsMobile] = useState(() => computeMobile(bp));
  useEffect(() => {
    const onResize = () => setIsMobile(computeMobile(bp));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [bp]);
  return isMobile;
}
