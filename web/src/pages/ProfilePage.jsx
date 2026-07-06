import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  SKIN_COLORS, HAIR_COLORS, CLOTHES_COLORS, BG_COLORS,
  TOPS, EYES, MOUTHS, FACIAL_HAIR, ACCESSORIES, CLOTHING,
  DEFAULT_LOOK, lookToConfig, configToLook, randomLook,
} from '../lib/avatarOptions';

function Swatch({ color, active, onClick }) {
  const bg = color === 'transparent' ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 12px 12px' : `#${color}`;
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded-full border-2 transition-transform ${active ? 'border-yellow-400 scale-110' : 'border-gray-700 hover:border-gray-500'}`}
      style={{ background: bg }}
      title={`#${color}`}
    />
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600"
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function ColorRow({ label, colors, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        {colors.map(c => <Swatch key={c} color={c} active={value === c} onClick={() => onChange(c)} />)}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { player, setAvatar } = useAuth();
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Cargar el avatar guardado
  useEffect(() => {
    api.get('/players/me')
      .then(({ data }) => {
        const cfg = data.avatar_config
          ? (typeof data.avatar_config === 'string' ? JSON.parse(data.avatar_config) : data.avatar_config)
          : null;
        if (cfg && Object.keys(cfg).length) setLook(configToLook(cfg));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const set = (k, v) => setLook(prev => ({ ...prev, [k]: v }));

  // Preview en vivo (grande)
  const svg = useMemo(() => createAvatar(avataaars, {
    seed: player?.nickname || 'yo',
    ...lookToConfig(look),
    size: 180,
  }).toString(), [look, player?.nickname]);

  async function save() {
    setSaving(true);
    try {
      const cfg = lookToConfig(look);
      await api.patch('/players/me/avatar', { avatarConfig: cfg });
      setAvatar(cfg);
      toast.success('¡Avatar guardado! Se verá en la mesa.');
    } catch {
      toast.error('No se pudo guardar el avatar');
    } finally {
      setSaving(false);
    }
  }

  if (!player) { navigate('/'); return null; }

  return (
    <div className="min-h-screen bg-gray-950 text-white lobby-bg">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-xl font-bold">🎭 Mi perfil</h1>
        <div className="w-16" />
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 grid md:grid-cols-[220px_1fr] gap-6">
        {/* Preview */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl overflow-hidden border-2 border-gray-700 shadow-2xl w-[180px] h-[180px] bg-gray-800"
            dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="text-lg font-bold">{player.nickname}</div>
          <Button variant="secondary" size="sm" onClick={() => setLook(randomLook())}>🎲 Aleatorio</Button>
          <Button className="w-full font-bold" disabled={saving || !loaded} onClick={save}>
            {saving ? 'Guardando...' : 'Guardar avatar'}
          </Button>
        </div>

        {/* Editor */}
        <div className="space-y-5 bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Peinado" value={look.top} options={TOPS} onChange={v => set('top', v)} />
            <Select label="Ojos" value={look.eyes} options={EYES} onChange={v => set('eyes', v)} />
            <Select label="Boca" value={look.mouth} options={MOUTHS} onChange={v => set('mouth', v)} />
            <Select label="Vello facial" value={look.facialHair} options={FACIAL_HAIR} onChange={v => set('facialHair', v)} />
            <Select label="Accesorios" value={look.accessories} options={ACCESSORIES} onChange={v => set('accessories', v)} />
            <Select label="Ropa" value={look.clothing} options={CLOTHING} onChange={v => set('clothing', v)} />
          </div>
          <ColorRow label="Color de piel" colors={SKIN_COLORS} value={look.skinColor} onChange={v => set('skinColor', v)} />
          <ColorRow label="Color de pelo" colors={HAIR_COLORS} value={look.hairColor} onChange={v => set('hairColor', v)} />
          <ColorRow label="Color de ropa" colors={CLOTHES_COLORS} value={look.clothesColor} onChange={v => set('clothesColor', v)} />
          <ColorRow label="Fondo" colors={BG_COLORS} value={look.backgroundColor} onChange={v => set('backgroundColor', v)} />
        </div>
      </main>
    </div>
  );
}
