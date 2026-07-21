// Estructura de ciegas para torneos, calibrada para el stack inicial de 10.000:
// empieza en ~100 ciegas grandes (50/100) y sube gradualmente hasta el endgame
// (2000/4000), sin que la ciega grande supere el stack. Las velocidades solo
// cambian la DURACIÓN de cada nivel, no los valores. Compartido entre el panel
// admin y la creación de torneos de club (antes estaba duplicado y desfasado,
// lo que hacía que en niveles altos la ciega superara el stack inicial).

const BLINDS = [
  { smallBlind: 50, bigBlind: 100 },
  { smallBlind: 75, bigBlind: 150 },
  { smallBlind: 100, bigBlind: 200 },
  { smallBlind: 150, bigBlind: 300, ante: 25 },
  { smallBlind: 200, bigBlind: 400, ante: 50 },
  { smallBlind: 300, bigBlind: 600, ante: 75 },
  { smallBlind: 500, bigBlind: 1000, ante: 100 },
  { smallBlind: 800, bigBlind: 1600, ante: 200 },
  { smallBlind: 1200, bigBlind: 2400, ante: 300 },
  { smallBlind: 2000, bigBlind: 4000, ante: 400 }, // último nivel: no sube más
];

// Genera el schedule aplicando la duración de cada nivel (el último = 99 min,
// se queda ahí hasta que termine el torneo).
function withMinutes(min) {
  return BLINDS.map((b, i) => ({ ...b, minutes: i === BLINDS.length - 1 ? 99 : min }));
}

export const SPEEDS = {
  normal: { label: 'Normal (3 min)', schedule: withMinutes(3) },
  turbo: { label: 'Turbo (1 min)', schedule: withMinutes(1) },
  hyper: { label: 'Hyper (30s)', schedule: withMinutes(0.5) },
  deep: { label: 'Deep (6 min)', schedule: withMinutes(6) },
};
