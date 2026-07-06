import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';

// Player notes/tags — persisted locally per logged-in user (PokerStars-style).
export const PLAYER_TAGS = {
  rock:    { emoji: '🪨', label: 'Roca',       color: '#9e9e9e', tip: 'Juega poco y solo paga — si apuesta, créele' },
  shark:   { emoji: '🦈', label: 'Tiburón',    color: '#42a5f5', tip: 'Bueno y agresivo — evítalo sin mano' },
  station: { emoji: '🎰', label: 'Paga todo',  color: '#66bb6a', tip: 'No le farolees — apuesta solo con mano hecha' },
  maniac:  { emoji: '🔥', label: 'Maníaco',    color: '#ef5350', tip: 'Sube con cualquier cosa — atrápalo con manos buenas' },
  fish:    { emoji: '🐟', label: 'Pez',        color: '#ffca28', tip: 'Débil — presiónalo' },
};

function storageKey() {
  let me = 'anon';
  try {
    const token = localStorage.getItem('token');
    if (token) me = JSON.parse(atob(token.split('.')[1])).id || 'anon';
  } catch {}
  return `player_notes_${me}`;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(storageKey())) || {};
  } catch {
    return {};
  }
}

export function usePlayerNotes() {
  const [notes, setNotes] = useState(load);

  // Al montar, trae las etiquetas del servidor y las mezcla con las locales
  // (el servidor manda: incluye estimatedLevel para la comparación admin)
  useEffect(() => {
    let alive = true;
    api.get('/players/labels').then(({ data }) => {
      if (!alive || !data) return;
      setNotes(prev => {
        const merged = { ...prev };
        for (const [pid, l] of Object.entries(data)) {
          merged[pid] = { tag: l.tag || undefined, note: l.note || undefined, estimatedLevel: l.estimatedLevel ?? undefined };
        }
        localStorage.setItem(storageKey(), JSON.stringify(merged));
        return merged;
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const getNote = useCallback((playerId) => notes[playerId] || null, [notes]);

  const saveNote = useCallback((playerId, tag, note, estimatedLevel) => {
    setNotes(prev => {
      const next = { ...prev };
      if (!tag && !note && !estimatedLevel) delete next[playerId];
      else next[playerId] = { tag, note, estimatedLevel };
      localStorage.setItem(storageKey(), JSON.stringify(next));
      return next;
    });
    // Sincroniza al servidor (best-effort) para que el admin compare adivinado vs real
    api.post('/players/labels', { targetId: playerId, tag: tag || null, note: note || null, estimatedLevel: estimatedLevel ?? null })
      .catch(() => {});
  }, []);

  return { notes, getNote, saveNote };
}
