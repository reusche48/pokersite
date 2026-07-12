// Modo gráfico con degradación elegante. El 3D NUNCA es obligatorio:
// en gama baja se cae a los avatares 2D para ahorrar batería.
//
// setting (localStorage): 'auto' | '3d' | '2d'
//  · auto → decide según la capacidad del dispositivo
//  · 3d / 2d → override manual del usuario

const KEY = 'graphics';

// Heurística de capacidad: memoria, núcleos, GPU y preferencia de movimiento.
export function detectCapability() {
  const mem = navigator.deviceMemory || 4;          // GB (aprox, no todos lo dan)
  const cores = navigator.hardwareConcurrency || 4;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

  let webgl = false, gpu = '', weakGpu = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    webgl = !!gl;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      // GPUs móviles antiguas / renderers por software → mejor 2D
      weakGpu = /Mali-4|Mali-T6|Mali-T7|Adreno 2|Adreno 3|Adreno 4|PowerVR|VideoCore|SwiftShader|llvmpipe|Software/i.test(gpu);
    }
  } catch { /* sin WebGL */ }

  const capable = webgl && !reduced && !weakGpu && mem >= 4 && cores >= 4;
  return { capable, mem, cores, webgl, weakGpu, reduced, gpu };
}

let _cap = null;
export function capability() {
  if (!_cap) _cap = detectCapability();
  return _cap;
}

export function getGraphicsSetting() {
  return localStorage.getItem(KEY) || 'auto';
}
export function setGraphicsSetting(v) {
  localStorage.setItem(KEY, v);
}

// Modo EFECTIVO ('3d' | '2d') a partir del ajuste y la capacidad real.
export function effectiveMode(setting = getGraphicsSetting()) {
  if (setting === '3d') return '3d';
  if (setting === '2d') return '2d';
  return capability().capable ? '3d' : '2d'; // auto
}
