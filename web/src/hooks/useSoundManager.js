import { useEffect, useState } from 'react';
import { playSfx, setMuted as setSfxMuted } from '../sounds/sfx';

export function useSoundManager() {
  const [muted, setMuted] = useState(() => localStorage.getItem('muted') === 'true');

  useEffect(() => {
    setSfxMuted(muted);
  }, [muted]);

  function play(name) {
    playSfx(name);
  }

  function startAmbient() { /* no-op — synthesized ambience disabled */ }
  function stopAmbient() { /* no-op */ }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('muted', next);
    setSfxMuted(next);
  }

  return { play, startAmbient, stopAmbient, muted, toggleMute };
}
