// Estructura de ciegas DERIVADA del stack inicial, no valores fijos. Lo que
// define un torneo es la PROFUNDIDAD en ciegas grandes (cuántas BB vale el
// stack), no el número de fichas: así, cambies el stack que cambies, la
// estructura queda siempre proporcional a "cómo entras".

// Debe coincidir con STARTING_STACK del backend (tournamentManager.js).
export const STARTING_STACK = 10000;

// Profundidad objetivo por nivel: cuántas ciegas grandes vale el stack inicial
// en cada nivel. Empieza en 100 BB (juego profundo) y baja hasta ~3 BB (endgame
// que fuerza el desenlace). Editar esto reescala TODA la estructura.
const BB_DEPTH = [100, 70, 50, 35, 25, 18, 13, 9, 6, 4];

// Redondea a un valor de ficha "bonito" (…50, 75, 100, 150, 200, 300, 400, 600,
// 800, 1000, 1500, 2000…) para que las ciegas no salgan como 143 o 833.
function niceBlind(x) {
  if (x < 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / mag; // 1..10
  let r;
  if (n < 1.25) r = 1; else if (n < 1.75) r = 1.5; else if (n < 2.5) r = 2;
  else if (n < 3.5) r = 3; else if (n < 4.5) r = 4; else if (n < 5.5) r = 5;
  else if (n < 7) r = 6; else if (n < 9) r = 8; else r = 10;
  return Math.round(r * mag);
}

// Construye el schedule: ciega grande = stack / profundidad (redondeada), ciega
// chica = mitad, ante ≈ 1/8 de la BB a partir del nivel 4. `minutes` por nivel
// (el último = 99, se queda ahí hasta que termine el torneo).
function buildSchedule(minutes) {
  return BB_DEPTH.map((depth, i) => {
    const bigBlind = niceBlind(STARTING_STACK / depth);
    const smallBlind = Math.round(bigBlind / 2); // la chica es exactamente la mitad
    const level = { smallBlind, bigBlind, minutes: i === BB_DEPTH.length - 1 ? 99 : minutes };
    if (i >= 3) level.ante = niceBlind(bigBlind / 8);
    return level;
  });
}

export const SPEEDS = {
  normal: { label: 'Normal (3 min)', schedule: buildSchedule(3) },
  turbo: { label: 'Turbo (1 min)', schedule: buildSchedule(1) },
  hyper: { label: 'Hyper (30s)', schedule: buildSchedule(0.5) },
  deep: { label: 'Deep (6 min)', schedule: buildSchedule(6) },
};
