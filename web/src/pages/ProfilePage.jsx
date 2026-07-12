import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AVATAR_STYLES, STYLE_MAP } from '../lib/avatarStyles';
import {
  SKIN_COLORS, HAIR_COLORS, CLOTHES_COLORS, BG_COLORS,
  TOPS, EYES, MOUTHS, FACIAL_HAIR, ACCESSORIES, CLOTHING,
  DEFAULT_LOOK, lookToConfig, configToLook, randomLook,
} from '../lib/avatarOptions';

function Swatch({ color, active, onClick }) {
  const bg = color === 'transparent' ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 12px 12px' : `#${color}`;
  return (
    <button onClick={onClick}
      className={`w-8 h-8 rounded-full border-2 transition-transform ${active ? 'border-yellow-400 scale-110' : 'border-gray-700 hover:border-gray-500'}`}
      style={{ background: bg }} title={`#${color}`} />
  );
}
function Select({ label, value, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600">
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

// Reduce una imagen a un cuadrado pequeño (base64) para no saturar la BD
function fileToSmallDataURL(file, size = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { player, setAvatar } = useAuth();
  const fileRef = useRef(null);
  const [style, setStyle] = useState('avataaars');
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [image, setImage] = useState(null); // data URL o http URL
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pwd, setPwd] = useState({ cur: '', next: '', busy: false });

  async function changePassword() {
    if (pwd.next.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    setPwd(p => ({ ...p, busy: true }));
    try {
      await api.post('/auth/change-password', { currentPassword: pwd.cur, newPassword: pwd.next });
      toast.success('Contraseña actualizada');
      setPwd({ cur: '', next: '', busy: false });
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cambiar la contraseña');
      setPwd(p => ({ ...p, busy: false }));
    }
  }

  useEffect(() => {
    api.get('/players/me').then(({ data }) => {
      const cfg = data.avatar_config
        ? (typeof data.avatar_config === 'string' ? JSON.parse(data.avatar_config) : data.avatar_config)
        : null;
      if (cfg?._image) { setImage(cfg._image); }
      else if (cfg) {
        setStyle(cfg._style || 'avataaars');
        if ((cfg._style || 'avataaars') === 'avataaars') setLook(configToLook(cfg));
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const set = (k, v) => setLook(prev => ({ ...prev, [k]: v }));

  // Config final según el modo activo
  const config = useMemo(() => {
    if (image) return { _image: image };
    if (style === 'avataaars') return { _style: 'avataaars', ...lookToConfig(look) };
    return { _style: style };
  }, [image, style, look]);

  // Preview grande
  const svg = useMemo(() => {
    if (image) return null;
    const { _style, ...params } = config;
    const collection = STYLE_MAP[_style] || avataaars;
    return createAvatar(collection, { seed: player?.nickname || 'yo', ...params, size: 180 }).toString();
  }, [config, image, player?.nickname]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Elige un archivo de imagen'); return; }
    try { setImage(await fileToSmallDataURL(file)); toast.success('Imagen cargada — dale Guardar'); }
    catch { toast.error('No se pudo leer la imagen'); }
  }
  function useUrl() {
    const u = urlInput.trim();
    if (!/^(https?:\/\/|data:image\/)/i.test(u)) { toast.error('Pega un enlace de imagen (https://…)'); return; }
    setImage(u); toast.success('Enlace listo — dale Guardar');
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch('/players/me/avatar', { avatarConfig: config });
      setAvatar(config);
      toast.success('¡Avatar guardado! Se verá en la mesa.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo guardar el avatar');
    } finally { setSaving(false); }
  }

  if (!player) { navigate('/'); return null; }
  const isFace = !image && style === 'avataaars';

  return (
    <div className="min-h-screen bg-gray-950 text-white lobby-bg">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-xl font-bold">🎭 Mi perfil</h1>
        <div className="w-16" />
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 grid md:grid-cols-[220px_1fr] gap-6">
        {/* Preview + acciones */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl overflow-hidden border-2 border-gray-700 shadow-2xl w-[180px] h-[180px] bg-gray-800">
            {image
              ? <img src={image} alt="preview" className="w-full h-full object-cover" />
              : <div dangerouslySetInnerHTML={{ __html: svg }} className="w-full h-full" />}
          </div>
          <div className="text-lg font-bold">{player.nickname}</div>
          {!image && <Button variant="secondary" size="sm" onClick={() => setLook(randomLook())} disabled={style !== 'avataaars'}>🎲 Aleatorio</Button>}
          {image && <Button variant="secondary" size="sm" onClick={() => { setImage(null); }}>Quitar imagen</Button>}
          <Button className="w-full font-bold" disabled={saving || !loaded} onClick={save}>
            {saving ? 'Guardando...' : 'Guardar avatar'}
          </Button>
        </div>

        {/* Editor */}
        <div className="space-y-5">
          {/* Estilo */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <label className="text-xs text-gray-400 font-semibold block mb-2 uppercase tracking-wider">Estilo de avatar</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_STYLES.map(s => (
                <button key={s.key}
                  onClick={() => { setStyle(s.key); setImage(null); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    !image && style === s.key ? 'bg-green-800 border-green-600 text-white font-bold' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            {!isFace && !image && (
              <p className="text-[11px] text-gray-500 mt-3">Este estilo se genera a partir de tu nombre. Para editar rasgos, elige “Cara personalizable”.</p>
            )}
          </div>

          {/* Cara personalizable (solo avataaars) */}
          {isFace && (
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
          )}

          {/* Imagen propia */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
            <label className="text-xs text-gray-400 font-semibold block uppercase tracking-wider">Usar mi propia imagen</label>
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>📁 Subir archivo</Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder="…o pega un enlace de imagen (https://…)" value={urlInput} onChange={e => setUrlInput(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={useUrl}>Usar</Button>
            </div>
            <p className="text-[11px] text-gray-500">La imagen se recorta en cuadrado. Usa solo imágenes que tengas permiso de usar.</p>
          </div>

          {/* Cambiar contraseña (cuentas con correo) */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
            <label className="text-xs text-gray-400 font-semibold block uppercase tracking-wider">🔒 Cambiar contraseña</label>
            <Input type="password" placeholder="Contraseña actual" value={pwd.cur} onChange={e => setPwd(p => ({ ...p, cur: e.target.value }))} />
            <Input type="password" placeholder="Nueva contraseña (mín. 8)" value={pwd.next} onChange={e => setPwd(p => ({ ...p, next: e.target.value }))} />
            <Button variant="secondary" size="sm" disabled={pwd.busy || !pwd.cur || !pwd.next} onClick={changePassword}>
              {pwd.busy ? 'Guardando…' : 'Actualizar contraseña'}
            </Button>
            <p className="text-[11px] text-gray-500">Solo para cuentas con correo. Recomendado si aún usas una contraseña por defecto.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
