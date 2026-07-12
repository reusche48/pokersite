// Huella de dispositivo para detección de multicuenta / ghosting.
// Combina señales ESTABLES y NO personales del navegador/dispositivo en un
// hash SHA-256. No identifica a la persona: solo permite ver si dos cuentas
// vienen del mismo aparato, o si el aparato de una cuenta cambió de golpe.
// No es infalible (un usuario avanzado puede alterarla) — es una capa más.

const KEY = 'device_fp';

function webglInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return gl.getParameter(gl.VERSION) || '';
    return `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)}~${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}`;
  } catch { return ''; }
}

function signals() {
  const s = window.screen || {};
  const nav = window.navigator || {};
  return [
    s.width, s.height, s.colorDepth,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
    nav.language, (nav.languages || []).join(','),
    nav.platform, nav.hardwareConcurrency, nav.deviceMemory,
    nav.maxTouchPoints,
    webglInfo(),
  ].join('|');
}

async function sha256Hex(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback simple si crypto.subtle no está (contexto no seguro)
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8).repeat(4);
  }
}

// Calcula (una vez) y cachea la huella. Idempotente.
export async function ensureFingerprint() {
  const cached = localStorage.getItem(KEY);
  if (cached) return cached;
  const fp = (await sha256Hex(signals())).slice(0, 64);
  localStorage.setItem(KEY, fp);
  return fp;
}

// Lectura síncrona (puede ser null en el primerísimo arranque antes de ensure)
export function getFingerprint() {
  return localStorage.getItem(KEY) || '';
}
