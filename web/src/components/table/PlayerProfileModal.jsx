import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from './Avatar';
import { PLAYER_TAGS } from '../../hooks/usePlayerNotes';

export function PlayerProfileModal({ player, currentNote, onSave, onClose }) {
  const [tag, setTag] = useState(currentNote?.tag || null);
  const [note, setNote] = useState(currentNote?.note || '');
  const [level, setLevel] = useState(currentNote?.estimatedLevel || null);

  if (!player) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-gray-900 rounded-2xl p-5 w-[340px] border border-gray-700 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar nickname={player.nickname} size={44} />
            <div>
              <h3 className="font-bold text-white text-lg leading-tight">{player.nickname}</h3>
              <span className="text-xs text-gray-400 font-mono">{player.stack?.toLocaleString()} fichas</span>
            </div>
          </div>

          {/* Tag picker */}
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Perfil del jugador</p>
          <div className="grid grid-cols-1 gap-1.5 mb-4">
            {Object.entries(PLAYER_TAGS).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setTag(tag === key ? null : key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
                  tag === key
                    ? 'border-2'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-800'
                }`}
                style={tag === key ? { borderColor: t.color, background: `${t.color}22` } : {}}
              >
                <span className="text-lg">{t.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{t.label}</div>
                  <div className="text-[10px] text-gray-400 truncate">{t.tip}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Nivel estimado (5-10) — el tester adivina la habilidad del rival */}
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
            ¿Qué nivel crees que tiene? <span className="text-gray-600 normal-case">(5 novato · 10 experto)</span>
          </p>
          <div className="flex gap-1.5 mb-4">
            {[5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                onClick={() => setLevel(level === n ? null : n)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  level === n
                    ? 'bg-yellow-600 text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Free note */}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Nota personal (ej: 'farolea en el river')"
            maxLength={200}
            rows={2}
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-600 resize-none mb-4"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
            >
              Cancelar
            </button>
            {(currentNote?.tag || currentNote?.note || currentNote?.estimatedLevel) && (
              <button
                onClick={() => { onSave(null, '', null); onClose(); }}
                className="flex-1 bg-red-900 hover:bg-red-800 text-white py-2 rounded-lg text-sm"
              >
                Quitar perfil
              </button>
            )}
            <button
              onClick={() => { onSave(tag, note.trim(), level); onClose(); }}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-sm"
            >
              Guardar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
