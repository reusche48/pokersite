import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Personaje 2.5D: muestra una IMAGEN por reacción y hace crossfade suave al
// cambiar de estado. Es tan ligero como una foto (funciona en cualquier
// teléfono) pero se ve tan bonito como el render que le pongas.
//
// Busca las imágenes reales en /characters/<charId>/<state>.(webp|png).
// Mientras no existan, usa un MARCADOR generado por código (SVG) para que la
// mesa se vea y anime desde ya. Cuando sueltes tus renders, se usan solos.

const STATE_EMOJI = { idle: '😎', think: '🤔', bet: '💰', call: '✅', allin: '🚀', fold: '🃏', win: '🏆', lose: '😞', sitout: '💤' };
const STATE_LABEL = { idle: 'esperando', think: 'pensando', bet: 'apuesta', call: 'paga', allin: 'ALL-IN', fold: 'se retira', win: '¡gana!', lose: 'pierde', sitout: 'ausente' };

// Marcador de posición: una silueta estilizada (gorra + lentes, guiño a tu
// referencia) que cambia de inclinación/gesto según la reacción. Se sustituye
// por tu imagen real en cuanto exista el archivo.
function placeholderDataURI(state, color) {
  const lean = { idle: 0, think: 8, bet: -6, call: -3, allin: -12, fold: 10, win: -4, lose: 14, sitout: 10 }[state] ?? 0;
  const bob = state === 'win' ? -12 : state === 'lose' ? 10 : 0;
  const mouth = state === 'win' ? 'M78 150 Q100 172 122 150' : state === 'lose' ? 'M78 158 Q100 142 122 158' : 'M82 152 Q100 160 118 152';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='300' viewBox='0 0 200 260'>
    <defs><radialGradient id='g' cx='50%' cy='35%' r='75%'>
      <stop offset='0%' stop-color='${color}' stop-opacity='0.9'/>
      <stop offset='100%' stop-color='${color}' stop-opacity='0.35'/>
    </radialGradient></defs>
    <g transform='translate(0 ${bob}) rotate(${lean} 100 200)'>
      <path d='M55 260 Q55 175 100 175 Q145 175 145 260 Z' fill='url(#g)'/>
      <rect x='72' y='168' width='56' height='30' rx='14' fill='#f2c9a0'/>
      <circle cx='100' cy='120' r='48' fill='#f2c9a0'/>
      <path d='M60 120 Q52 165 78 200 Q66 150 72 120 Z' fill='#8a4b26'/>
      <path d='M140 120 Q148 165 122 205 Q134 150 128 120 Z' fill='#8a4b26'/>
      <path d='M52 108 Q100 60 148 108 Q150 90 100 82 Q50 90 52 108 Z' fill='${color}'/>
      <path d='M148 104 Q168 100 170 110 Q160 112 148 112 Z' fill='${color}'/>
      <rect x='66' y='112' width='30' height='20' rx='9' fill='#1a1a1a'/>
      <rect x='104' y='112' width='30' height='20' rx='9' fill='#1a1a1a'/>
      <rect x='96' y='118' width='8' height='4' fill='#1a1a1a'/>
      <path d='${mouth}' stroke='#a0522d' stroke-width='4' fill='none' stroke-linecap='round'/>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function Character25D({ charId = 'demo', color = '#ef4444', state = 'idle', name }) {
  // Intentamos la imagen real; si falla, marcador. Reintenta al cambiar charId.
  const [src, setSrc] = useState(`/characters/${charId}/${state}.webp`);
  const realTried = useState(() => ({ webp: false, png: false }))[0];

  // Recalcula la fuente cuando cambia el estado
  const key = `${charId}:${state}`;

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-[120px] h-[150px] md:w-[150px] md:h-[188px]">
        <AnimatePresence mode="popLayout">
          <motion.img
            key={key}
            src={`/characters/${charId}/${state}.webp`}
            onError={(e) => {
              // webp → png → marcador
              const img = e.currentTarget;
              if (!realTried.webp) { realTried.webp = true; img.src = `/characters/${charId}/${state}.png`; return; }
              if (!realTried.png) { realTried.png = true; img.src = placeholderDataURI(state, color); return; }
              img.src = placeholderDataURI(state, color);
            }}
            alt={`${name || charId} ${state}`}
            draggable={false}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, position: 'absolute', top: 0 }}
            transition={{ duration: 0.28 }}
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]"
          />
        </AnimatePresence>
        {/* Burbuja de reacción */}
        <AnimatePresence>
          {state !== 'idle' && state !== 'sitout' && (
            <motion.div
              key={`badge-${state}`}
              initial={{ opacity: 0, y: 8, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="absolute -top-2 -right-1 bg-white/95 text-black text-xs font-bold rounded-full px-2 py-0.5 shadow-lg flex items-center gap-1"
            >
              <span>{STATE_EMOJI[state]}</span><span>{STATE_LABEL[state]}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {name && <span className="mt-1 text-xs text-gray-300 font-semibold">{name}</span>}
    </div>
  );
}
