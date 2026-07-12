'use strict';

// Logger estructurado mínimo, sin dependencias externas. En producción emite
// una línea JSON por evento (indexable por cualquier colector de logs); en
// desarrollo, texto legible con timestamp. Migración incremental: se usa en los
// puntos críticos (arranque, errores no controlados, error handler) y se puede
// ir adoptando en el resto en lugar de console.*.

const isProd = process.env.NODE_ENV === 'production';

function emit(level, msg, meta) {
  const time = new Date().toISOString();
  if (isProd) {
    process.stdout.write(JSON.stringify({ time, level, msg, ...(meta || {}) }) + '\n');
  } else {
    const extra = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    (level === 'error' ? console.error : console.log)(`${time} [${level}] ${msg}${extra}`);
  }
}

module.exports = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
