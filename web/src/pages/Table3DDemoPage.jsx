import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Character3D } from '../components/table3d/Character3D';
import { Avatar } from '../components/table/Avatar';
import { capability, getGraphicsSetting, setGraphicsSetting, effectiveMode } from '../lib/graphics';

// Página de PRUEBA (Fase 1): valida rendimiento y el cableado jugada→animación
// del 3D en tu propio teléfono, aislada de la mesa real. El interruptor 3D/2D/Auto
// deja al usuario ahorrar batería en gama baja.

const SEATS = [
  { name: 'Tú', color: '#eab308', skin: '#e0ac69' },
  { name: 'María', color: '#ec4899', skin: '#c68642' },
  { name: 'Diego', color: '#3b82f6', skin: '#8d5524' },
  { name: 'Lucía', color: '#22c55e', skin: '#ffdbac' },
  { name: 'Carlos', color: '#a855f7', skin: '#e0ac69' },
];

// Estado de animación (3D) ↔ estado del avatar 2D
const STATE_2D = { idle: 'idle', think: 'thinking', bet: 'all_in', call: 'idle', allin: 'all_in', fold: 'folded', win: 'won', lose: 'folded', sitout: 'folded' };

// Medidor de FPS dentro del Canvas
function FpsMeter({ onFps }) {
  const acc = useRef({ frames: 0, t: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.frames++; a.t += delta;
    if (a.t >= 0.5) { onFps(Math.round(a.frames / a.t)); a.frames = 0; a.t = 0; }
  });
  return null;
}

// Arco suave frente a la cámara: el del medio adelante, los extremos curvan
// hacia atrás (abanico mirando al espectador). t va de -1 (izq) a 1 (der).
function seatPos(i, n) {
  const t = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
  const x = t * 2.7;               // más separación → no se solapan
  const z = -0.7 - t * t * 0.3;    // arco suave, casi en fila
  return [x, 0, z];
}

export function Table3DDemoPage() {
  const navigate = useNavigate();
  const cap = useMemo(() => capability(), []);
  const [setting, setSetting] = useState(getGraphicsSetting());
  const [fps, setFps] = useState(0);
  const [states, setStates] = useState(() => SEATS.map(() => 'idle'));

  const mode = effectiveMode(setting);

  function chooseSetting(v) { setSetting(v); setGraphicsSetting(v); }

  // Dispara una acción en un asiento y vuelve a idle tras la animación
  const timers = useRef({});
  function act(seat, state, holdMs = 2200) {
    setStates(prev => prev.map((s, i) => (i === seat ? state : s)));
    clearTimeout(timers.current[seat]);
    timers.current[seat] = setTimeout(() => {
      setStates(prev => prev.map((s, i) => (i === seat ? (state === 'fold' || state === 'lose' ? 'sitout' : 'idle') : s)));
    }, holdMs);
  }
  // Misma reacción en TODOS los asientos (para verla sin dudas en la prueba)
  function actAll(state) { SEATS.forEach((_, i) => act(i, state)); }
  // Simula una "mano": todos piensan, uno sube, otros pagan/foldean, showdown
  function playHand() {
    SEATS.forEach((_, i) => act(i, 'think', 900));
    setTimeout(() => act(2, 'bet', 1400), 900);
    setTimeout(() => { act(0, 'call', 1400); act(1, 'fold', 4000); act(3, 'call', 1400); act(4, 'fold', 4000); }, 1600);
    setTimeout(() => { act(2, 'win', 2500); act(0, 'lose', 2500); act(3, 'lose', 2500); }, 3400);
  }

  const ACTIONS = [
    { label: '🤔 Pensar', st: 'think' }, { label: '💰 Apostar', st: 'bet' },
    { label: '✅ Pagar', st: 'call' }, { label: '🚀 All-in', st: 'allin' },
    { label: '🃏 Foldear', st: 'fold' }, { label: '🏆 Ganar', st: 'win' }, { label: '😞 Perder', st: 'lose' },
  ];
  const STATE_EMOJI = { idle: '😐', think: '🤔', bet: '💰', call: '✅', allin: '🚀', fold: '🃏', win: '🏆', lose: '😞', sitout: '💤' };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-lg font-bold">🎬 Mesa 3D <span className="text-xs text-yellow-500 font-normal">(prueba)</span></h1>
        <div className="text-xs font-mono text-gray-400">{mode === '3d' ? `${fps} fps` : '2D'}</div>
      </header>

      {/* Interruptor de gráficos */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Gráficos</span>
          <div className="flex gap-1 ml-auto">
            {[
              { v: 'auto', l: 'Auto' }, { v: '3d', l: '3D' }, { v: '2d', l: '2D' },
            ].map(o => (
              <button key={o.v} onClick={() => chooseSetting(o.v)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${setting === o.v ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          Auto detectó: <b className={cap.capable ? 'text-green-400' : 'text-orange-400'}>{cap.capable ? '3D apto' : '2D (ahorro)'}</b>
          {' · '}{cap.mem}GB · {cap.cores} núcleos · {cap.webgl ? 'WebGL ✓' : 'sin WebGL'}
          {cap.weakGpu && ' · GPU modesta'}{cap.reduced && ' · movimiento reducido'}
          {cap.gpu ? ` · ${cap.gpu.slice(0, 40)}` : ''}
        </p>
      </div>

      {/* Indicador de estado por asiento (prueba que la reacción registró,
          aunque el muñeco sea pequeño) */}
      <div className="flex justify-center gap-2 px-2 py-2 bg-black/30 flex-wrap">
        {SEATS.map((s, i) => (
          <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${states[i] !== 'idle' && states[i] !== 'sitout' ? 'bg-yellow-600/30 text-yellow-200' : 'bg-gray-800/60 text-gray-400'}`}>
            <span className="text-base leading-none">{STATE_EMOJI[states[i]] || '😐'}</span>
            <span className="font-semibold">{s.name}</span>
          </div>
        ))}
      </div>

      {/* Escena */}
      <div className="flex-1 min-h-[380px] relative">
        {mode === '3d' ? (
          <Canvas
            shadows
            frameloop="always"
            camera={{ position: [0, 1.7, 5.6], fov: 44 }}
            onCreated={({ camera }) => camera.lookAt(0, 0.7, -0.7)}
            dpr={[1, 1.8]}
          >
            <color attach="background" args={['#0c1a14']} />
            <ambientLight intensity={0.75} />
            <directionalLight position={[3, 6, 4]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
            <FpsMeter onFps={setFps} />
            {/* Fieltro */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -0.6]} receiveShadow>
              <cylinderGeometry args={[2.7, 2.7, 0.1, 48]} />
              <meshStandardMaterial color="#1f6b47" roughness={0.9} />
            </mesh>
            {SEATS.map((s, i) => {
              const [x, , z] = seatPos(i, SEATS.length);
              return (
                <group key={i} position={[x, 0, z]} scale={1.25}>
                  <Character3D state={states[i]} color={s.color} skin={s.skin} />
                </group>
              );
            })}
          </Canvas>
        ) : (
          // Fallback 2D (avatares DiceBear) — mismo estado de animación
          <div className="h-full flex flex-wrap items-center justify-center gap-6 p-6 bg-[#0c1a14]">
            {SEATS.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Avatar nickname={s.name} avatarConfig={{ _style: 'avataaars' }} state={STATE_2D[states[i]] || 'idle'} size={64} />
                <span className="text-xs text-gray-400">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controles: dispara jugadas para ver las reacciones */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={playHand} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-sm">▶ Simular una mano completa</button>
        </div>
        <div className="text-[11px] text-gray-500">O dispara una reacción en <b>todos</b> los personajes a la vez:</div>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map(a => (
            <button key={a.st} onClick={() => actAll(a.st)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-yellow-700 active:text-black">
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
