import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Character25D } from '../components/table25d/Character25D';

// Mesa 2.5D (Fase 2, estilo elegido): personajes ilustrados que reaccionan a
// las jugadas. Ligero como fotos → vuela en cualquier teléfono. Usa marcadores
// hasta que sueltes tus renders en /characters/<id>/<reaccion>.png.

const SEATS = [
  { id: 'luci', name: 'Luci', color: '#ef4444' },
  { id: 'maria', name: 'María', color: '#ec4899' },
  { id: 'diego', name: 'Diego', color: '#3b82f6' },
  { id: 'sofia', name: 'Sofía', color: '#a855f7' },
  { id: 'carlos', name: 'Carlos', color: '#f59e0b' },
];

const ACTIONS = [
  { label: '🤔 Pensar', st: 'think' }, { label: '💰 Apostar', st: 'bet' },
  { label: '✅ Pagar', st: 'call' }, { label: '🚀 All-in', st: 'allin' },
  { label: '🃏 Foldear', st: 'fold' }, { label: '🏆 Ganar', st: 'win' }, { label: '😞 Perder', st: 'lose' },
];

export function Table25DDemoPage() {
  const navigate = useNavigate();
  const [states, setStates] = useState(() => SEATS.map(() => 'idle'));
  const timers = useRef({});

  function act(seat, state, holdMs = 2600) {
    setStates(prev => prev.map((s, i) => (i === seat ? state : s)));
    clearTimeout(timers.current[seat]);
    timers.current[seat] = setTimeout(() => {
      setStates(prev => prev.map((s, i) => (i === seat ? (state === 'fold' || state === 'lose' ? 'sitout' : 'idle') : s)));
    }, holdMs);
  }
  function actAll(state) { SEATS.forEach((_, i) => act(i, state)); }
  function playHand() {
    SEATS.forEach((_, i) => act(i, 'think', 1100));
    setTimeout(() => act(2, 'bet', 1800), 1100);
    setTimeout(() => { act(0, 'call', 1800); act(1, 'fold', 5000); act(3, 'call', 1800); act(4, 'fold', 5000); }, 2000);
    setTimeout(() => { act(2, 'win', 3200); act(0, 'lose', 3200); act(3, 'lose', 3200); }, 4200);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 z-10">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-lg font-bold">🎨 Mesa 2.5D <span className="text-xs text-yellow-500 font-normal">(estilo)</span></h1>
        <div className="w-14" />
      </header>

      {/* Escena: fondo oscuro con brillo rojo (como tu referencia) */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(220,40,50,0.35) 0%, rgba(12,8,12,1) 65%)' }}>

        {/* Fieltro rojo */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '4%', width: '92%', maxWidth: 760, height: 220 }}>
          <div className="w-full h-full rounded-[50%]"
            style={{ background: 'radial-gradient(ellipse at 50% 35%, #e0323c 0%, #a01722 70%, #6e0f18 100%)', boxShadow: '0 20px 60px rgba(200,30,40,0.35), inset 0 6px 20px rgba(255,255,255,0.12)' }} />
          {/* Fichas al centro */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1.5">
            {['#e8e8e8', '#2ecc71', '#e74c3c', '#2ecc71'].map((c, i) => (
              <div key={i} className="rounded-full" style={{ width: 26, height: 26, background: c, border: '3px dashed rgba(255,255,255,0.6)', boxShadow: '0 3px 0 rgba(0,0,0,0.3)' }} />
            ))}
          </div>
        </div>

        {/* Personajes en arco sobre el fieltro */}
        <div className="absolute left-0 right-0 flex justify-center items-end gap-1 md:gap-4 px-2" style={{ bottom: '16%' }}>
          {SEATS.map((s, i) => {
            // arco: los del medio un poco más arriba
            const t = (i - (SEATS.length - 1) / 2) / ((SEATS.length - 1) / 2);
            const lift = (1 - t * t) * 34;
            return (
              <div key={s.id} style={{ transform: `translateY(${-lift}px)` }}>
                <Character25D charId={s.id} color={s.color} name={s.name} state={states[i]} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Controles */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/70 space-y-2 z-10">
        <button onClick={playHand} className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-sm">▶ Simular una mano completa</button>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map(a => (
            <button key={a.st} onClick={() => actAll(a.st)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-yellow-700 active:text-black">
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">
          Marcadores de posición. Suelta tus renders en <code className="bg-black/40 px-1 rounded">web/public/characters/&lt;id&gt;/&lt;reacción&gt;.png</code> y aparecen solos.
          IDs: {SEATS.map(s => s.id).join(', ')}.
        </p>
      </div>
    </div>
  );
}
