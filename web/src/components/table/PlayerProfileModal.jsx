import { useState } from 'react';
import { Avatar } from './Avatar';
import { PLAYER_TAGS } from '../../hooks/usePlayerNotes';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function PlayerProfileModal({ player, currentNote, onSave, onClose }) {
  const [tag, setTag] = useState(currentNote?.tag || null);
  const [note, setNote] = useState(currentNote?.note || '');
  const [level, setLevel] = useState(currentNote?.estimatedLevel || null);

  if (!player) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[360px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar nickname={player.nickname} size={44} />
            <div className="text-left">
              <DialogTitle>{player.nickname}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {player.stack?.toLocaleString()} fichas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tag picker */}
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Perfil del jugador</p>
        <div className="grid grid-cols-1 gap-1.5">
          {Object.entries(PLAYER_TAGS).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setTag(tag === key ? null : key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
                tag === key ? 'border-2' : 'border-gray-700 hover:border-gray-500 bg-gray-800'
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

        {/* Nivel estimado (5-10) */}
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
          ¿Qué nivel crees que tiene? <span className="text-gray-600 normal-case">(5 novato · 10 experto)</span>
        </p>
        <div className="flex gap-1.5">
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
          className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-600 resize-none"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          {(currentNote?.tag || currentNote?.note || currentNote?.estimatedLevel) && (
            <Button variant="destructive" onClick={() => { onSave(null, '', null); onClose(); }}>
              Quitar perfil
            </Button>
          )}
          <Button onClick={() => { onSave(tag, note.trim(), level); onClose(); }} className="font-bold">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
