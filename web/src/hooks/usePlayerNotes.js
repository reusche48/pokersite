import { useState, useCallback } from 'react';

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

  const getNote = useCallback((playerId) => notes[playerId] || null, [notes]);

  const saveNote = useCallback((playerId, tag, note) => {
    setNotes(prev => {
      const next = { ...prev };
      if (!tag && !note) delete next[playerId];
      else next[playerId] = { tag, note };
      localStorage.setItem(storageKey(), JSON.stringify(next));
      return next;
    });
  }, []);

  return { notes, getNote, saveNote };
}
