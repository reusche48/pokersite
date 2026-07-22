import { useEffect, useRef, useState } from 'react';

// Tarjeta de campeón: dibuja una imagen 1080x1080 con los datos del torneo y
// ofrece compartir (Web Share API con archivo, ideal en móvil) o descargar.
export function ChampionOverlay({ data, onClose }) {
  const canvasRef = useRef(null);
  const [imgUrl, setImgUrl] = useState(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !data) return;
    const W = 1080, H = 1080;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Fondo degradado + resplandor
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a1247'); g.addColorStop(0.5, '#171029'); g.addColorStop(1, '#0e2a20');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, 360, 40, W / 2, 360, 560);
    rg.addColorStop(0, 'rgba(190,130,255,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(212,164,95,0.75)'; ctx.lineWidth = 6;
    ctx.strokeRect(42, 42, W - 84, H - 84);

    ctx.textAlign = 'center';
    ctx.font = '230px serif'; ctx.fillText('🏆', W / 2, 350);
    ctx.fillStyle = '#e6b877'; ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.fillText('¡CAMPEÓN!', W / 2, 480);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.fillText(String(data.champion?.nickname || 'Campeón').slice(0, 20), W / 2, 578);
    ctx.fillStyle = '#c9b7e8'; ctx.font = '44px system-ui, sans-serif';
    ctx.fillText(`🏆 ${String(data.name || 'Torneo').slice(0, 28)}`, W / 2, 656);

    ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 116px system-ui, sans-serif';
    ctx.fillText(`+${Number(data.champion?.prize || 0).toLocaleString()}`, W / 2, 812);
    ctx.fillStyle = '#a99a7a'; ctx.font = '42px system-ui, sans-serif';
    ctx.fillText('fichas ganadas', W / 2, 866);

    let dateStr = '';
    try { dateStr = new Date(data.endedAt).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { dateStr = ''; }
    ctx.fillStyle = '#9fb0a8'; ctx.font = '42px system-ui, sans-serif';
    ctx.fillText(`👥 ${data.totalEntrants || '?'} jugadores    ·    📅 ${dateStr}${data.code ? `    ·    ${data.code}` : ''}`, W / 2, 952);
    ctx.fillStyle = '#8a7eb0'; ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText('♠ PokerSite', W / 2, 1028);

    c.toBlob((blob) => { if (blob) setImgUrl(URL.createObjectURL(blob)); }, 'image/png');
  }, [data]);

  function blobFromCanvas() {
    return new Promise((res) => canvasRef.current.toBlob(res, 'image/png'));
  }
  async function share() {
    const blob = await blobFromCanvas();
    const file = new File([blob], 'campeon-pokersite.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '¡Campeón!', text: `¡Gané ${data.name} en PokerSite! 🏆` });
      } else {
        download();
      }
    } catch { /* el usuario canceló el diálogo de compartir */ }
  }
  function download() {
    if (!imgUrl) return;
    const a = document.createElement('a');
    a.href = imgUrl; a.download = 'campeon-pokersite.png'; a.click();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-5 overflow-auto">
      <canvas ref={canvasRef} className="hidden" />
      {imgUrl
        ? <img src={imgUrl} alt="Tarjeta de campeón" className="max-w-full max-h-[68vh] rounded-2xl shadow-2xl ring-1 ring-yellow-600/40" />
        : <div className="text-yellow-200 animate-pulse text-lg">Preparando tu tarjeta de campeón…</div>}
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={share} disabled={!imgUrl} className="bg-green-600 hover:bg-green-500 disabled:opacity-40 font-bold px-6 py-3 rounded-xl text-white">📤 Compartir</button>
        <button onClick={download} disabled={!imgUrl} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 font-bold px-6 py-3 rounded-xl text-white">⬇ Descargar</button>
        <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 font-bold px-6 py-3 rounded-xl text-gray-300">Volver al lobby</button>
      </div>
    </div>
  );
}
