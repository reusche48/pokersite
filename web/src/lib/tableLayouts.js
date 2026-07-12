// Layouts de asientos de la mesa (posiciones % de silla y de apuesta).
// Compartido entre PokerTable (mesa en vivo) y HandReplayPage (replay) para no
// duplicar ~90 líneas que antes divergían entre sí.

// Escritorio. El héroe va SIEMPRE al final = abajo-centro; el resto rodea el óvalo.
export const LAYOUTS = {
  1: [
    { seat: { top: '88%', left: '50%' }, bet: { top: '66%', left: '50%' } },
  ],
  2: [
    { seat: { top: '7%', left: '50%' }, bet: { top: '30%', left: '50%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  3: [
    { seat: { top: '7%', left: '26%' }, bet: { top: '30%', left: '36%' } },
    { seat: { top: '7%', left: '74%' }, bet: { top: '30%', left: '64%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  4: [
    { seat: { top: '7%', left: '50%' }, bet: { top: '30%', left: '50%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  5: [
    { seat: { top: '7%', left: '26%' }, bet: { top: '30%', left: '36%' } },
    { seat: { top: '7%', left: '74%' }, bet: { top: '30%', left: '64%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  6: [
    { seat: { top: '7%', left: '30%' }, bet: { top: '30%', left: '38%' } },
    { seat: { top: '7%', left: '70%' }, bet: { top: '30%', left: '62%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '84%', left: '30%' }, bet: { top: '62%', left: '38%' } },
    { seat: { top: '84%', left: '70%' }, bet: { top: '62%', left: '62%' } },
  ],
  // Full ring (7–9): orden circular [héroe abajo-centro, luego a la izquierda].
  7: [
    { seat: { top: '85%', left: '50%' }, bet: { top: '66%', left: '50%' } },
    { seat: { top: '70%', left: '16%' }, bet: { top: '58%', left: '30%' } },
    { seat: { top: '37%', left: '8%'  }, bet: { top: '42%', left: '26%' } },
    { seat: { top: '11%', left: '31%' }, bet: { top: '29%', left: '39%' } },
    { seat: { top: '11%', left: '69%' }, bet: { top: '29%', left: '61%' } },
    { seat: { top: '37%', left: '92%' }, bet: { top: '42%', left: '74%' } },
    { seat: { top: '70%', left: '84%' }, bet: { top: '58%', left: '70%' } },
  ],
  8: [
    { seat: { top: '85%', left: '50%' }, bet: { top: '66%', left: '50%' } },
    { seat: { top: '74%', left: '20%' }, bet: { top: '60%', left: '33%' } },
    { seat: { top: '46%', left: '7%'  }, bet: { top: '46%', left: '25%' } },
    { seat: { top: '18%', left: '20%' }, bet: { top: '32%', left: '33%' } },
    { seat: { top: '7%',  left: '50%' }, bet: { top: '27%', left: '50%' } },
    { seat: { top: '18%', left: '80%' }, bet: { top: '32%', left: '67%' } },
    { seat: { top: '46%', left: '93%' }, bet: { top: '46%', left: '75%' } },
    { seat: { top: '74%', left: '80%' }, bet: { top: '60%', left: '67%' } },
  ],
  9: [
    { seat: { top: '85%', left: '50%' }, bet: { top: '66%', left: '50%' } },
    { seat: { top: '76%', left: '22%' }, bet: { top: '61%', left: '34%' } },
    { seat: { top: '53%', left: '8%'  }, bet: { top: '50%', left: '26%' } },
    { seat: { top: '27%', left: '13%' }, bet: { top: '37%', left: '29%' } },
    { seat: { top: '9%',  left: '35%' }, bet: { top: '28%', left: '41%' } },
    { seat: { top: '9%',  left: '65%' }, bet: { top: '28%', left: '59%' } },
    { seat: { top: '27%', left: '87%' }, bet: { top: '37%', left: '72%' } },
    { seat: { top: '53%', left: '92%' }, bet: { top: '50%', left: '74%' } },
    { seat: { top: '76%', left: '78%' }, bet: { top: '61%', left: '66%' } },
  ],
};

// Móvil (vertical): rivales arriba, héroe abajo, centro despejado para el board.
export const MOBILE_LAYOUTS = {
  1: [
    { seat: { top: '84%', left: '50%' }, bet: { top: '68%', left: '50%' } },
  ],
  2: [
    { seat: { top: '11%', left: '50%' }, bet: { top: '28%', left: '50%' } },
    { seat: { top: '84%', left: '50%' }, bet: { top: '67%', left: '50%' } },
  ],
  3: [
    { seat: { top: '12%', left: '24%' }, bet: { top: '28%', left: '32%' } },
    { seat: { top: '12%', left: '76%' }, bet: { top: '28%', left: '68%' } },
    { seat: { top: '84%', left: '50%' }, bet: { top: '67%', left: '50%' } },
  ],
  4: [
    { seat: { top: '9%',  left: '50%' }, bet: { top: '24%', left: '50%' } },
    { seat: { top: '27%', left: '19%' }, bet: { top: '38%', left: '30%' } },
    { seat: { top: '27%', left: '81%' }, bet: { top: '38%', left: '70%' } },
    { seat: { top: '84%', left: '50%' }, bet: { top: '67%', left: '50%' } },
  ],
  5: [
    { seat: { top: '9%',  left: '30%' }, bet: { top: '24%', left: '36%' } },
    { seat: { top: '9%',  left: '70%' }, bet: { top: '24%', left: '64%' } },
    { seat: { top: '30%', left: '18%' }, bet: { top: '40%', left: '29%' } },
    { seat: { top: '30%', left: '82%' }, bet: { top: '40%', left: '71%' } },
    { seat: { top: '84%', left: '50%' }, bet: { top: '67%', left: '50%' } },
  ],
  6: [
    { seat: { top: '9%',  left: '29%' }, bet: { top: '23%', left: '35%' } },
    { seat: { top: '9%',  left: '71%' }, bet: { top: '23%', left: '65%' } },
    { seat: { top: '29%', left: '18%' }, bet: { top: '39%', left: '29%' } },
    { seat: { top: '29%', left: '82%' }, bet: { top: '39%', left: '71%' } },
    { seat: { top: '84%', left: '32%' }, bet: { top: '68%', left: '38%' } },
    { seat: { top: '84%', left: '68%' }, bet: { top: '68%', left: '62%' } },
  ],
};

// Full ring (7–9) en vertical: posiciones explícitas que esquivan la franja del
// board (esquinas abajo, laterales sobre el board, fila alta).
const MOBILE_RING = {
  7: [
    { seat: { top: '88%', left: '50%' }, bet: { top: '72%', left: '50%' } },
    { seat: { top: '68%', left: '13%' }, bet: { top: '60%', left: '30%' } },
    { seat: { top: '30%', left: '8%'  }, bet: { top: '39%', left: '27%' } },
    { seat: { top: '8%',  left: '35%' }, bet: { top: '27%', left: '42%' } },
    { seat: { top: '8%',  left: '65%' }, bet: { top: '27%', left: '58%' } },
    { seat: { top: '30%', left: '92%' }, bet: { top: '39%', left: '73%' } },
    { seat: { top: '68%', left: '87%' }, bet: { top: '60%', left: '70%' } },
  ],
  8: [
    { seat: { top: '88%', left: '50%' }, bet: { top: '72%', left: '50%' } },
    { seat: { top: '68%', left: '13%' }, bet: { top: '60%', left: '30%' } },
    { seat: { top: '30%', left: '8%'  }, bet: { top: '39%', left: '27%' } },
    { seat: { top: '10%', left: '25%' }, bet: { top: '28%', left: '36%' } },
    { seat: { top: '7%',  left: '50%' }, bet: { top: '26%', left: '50%' } },
    { seat: { top: '10%', left: '75%' }, bet: { top: '28%', left: '64%' } },
    { seat: { top: '30%', left: '92%' }, bet: { top: '39%', left: '73%' } },
    { seat: { top: '68%', left: '87%' }, bet: { top: '60%', left: '70%' } },
  ],
  9: [
    { seat: { top: '88%', left: '50%' }, bet: { top: '72%', left: '50%' } },
    { seat: { top: '68%', left: '13%' }, bet: { top: '60%', left: '30%' } },
    { seat: { top: '30%', left: '8%'  }, bet: { top: '39%', left: '27%' } },
    { seat: { top: '12%', left: '14%' }, bet: { top: '29%', left: '30%' } },
    { seat: { top: '8%',  left: '38%' }, bet: { top: '27%', left: '43%' } },
    { seat: { top: '8%',  left: '62%' }, bet: { top: '27%', left: '57%' } },
    { seat: { top: '12%', left: '86%' }, bet: { top: '29%', left: '70%' } },
    { seat: { top: '30%', left: '92%' }, bet: { top: '39%', left: '73%' } },
    { seat: { top: '68%', left: '87%' }, bet: { top: '60%', left: '70%' } },
  ],
};

// Coloca los asientos sobre el borde del óvalo con trigonometría (cos/sin), en
// orden circular [héroe, rival1, rival2, ...]. Para 7–9 usa MOBILE_RING.
export function buildMobileOval(n) {
  const RX = 43, RY = 37, A = 118;
  if (n >= 7) return MOBILE_RING[Math.min(n, 9)];
  const rad = (d) => (d * Math.PI) / 180;
  const at = (deg, rx, ry) => ({
    left: `${(50 + rx * Math.cos(rad(deg))).toFixed(1)}%`,
    top: `${(50 + ry * Math.sin(rad(deg))).toFixed(1)}%`,
  });
  const slots = [{ seat: { top: '88%', left: '50%' }, bet: { top: '72%', left: '50%' } }];
  const r = n - 1;
  for (let i = 0; i < r; i++) {
    const deg = r === 1 ? 270 : (270 - A) + i * ((2 * A) / (r - 1));
    slots.push({ seat: at(deg, RX, RY), bet: at(deg, RX * 0.58, RY * 0.58) });
  }
  return slots;
}

// Orden de asignación de asiento por layout (héroe primero, luego en pantalla).
export const ASSIGN_ORDER = {
  1: [0],
  2: [1, 0],
  3: [2, 0, 1],
  4: [3, 2, 0, 1],
  5: [4, 3, 0, 1, 2],
  6: [5, 4, 3, 0, 1, 2],
  7: [0, 1, 2, 3, 4, 5, 6],
  8: [0, 1, 2, 3, 4, 5, 6, 7],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
