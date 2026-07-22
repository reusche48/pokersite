require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const setupDb = require('./src/config/setupDb');
const initSockets = require('./src/sockets');
const log = require('./src/config/logger');

const helmet = require('helmet');

const app = express();
// Detrás de un proxy (Railway/Nginx): confiar solo en N saltos para que req.ip
// sea la IP real del cliente y NO una X-Forwarded-For falsificada (clave para
// el límite anti-multicuenta). Configurable por TRUST_PROXY_HOPS (default 1).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Cabeceras de seguridad (HSTS, X-Frame-Options, nosniff…). CSP se deja fuera
// para no romper la SPA/PWA con scripts inline; se afina aparte si se necesita.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS: por defecto abierto (dev); en producción, lista blanca por
// ALLOWED_ORIGINS (dominios separados por coma).
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOrigin = ALLOWED.length ? ALLOWED : '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Rate-limit global para rutas que MUTAN estado (crear/unirse/refill…), además
// del limiter específico de auth. Lecturas quedan libres.
const rateLimit = require('express-rate-limit');
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, espera un momento' },
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
});
app.use('/api', mutationLimiter);

// Health check para el orquestador (Railway/Docker): verifica el proceso y la
// conexión a MySQL. 200 = listo, 503 = la DB no responde.
const APP_VERSION = require('./src/config/version');
app.get('/health', async (req, res) => {
  try {
    await require('./src/config/db').query('SELECT 1');
    res.json({ status: 'ok', version: APP_VERSION, uptime: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: 'db_down', version: APP_VERSION, error: e.code || e.message });
  }
});
// Versión visible en la app (el lobby la muestra): permite saber de un vistazo
// si producción corre el último deploy.
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));

// Rate-limit en auth: frena fuerza bruta de contraseñas sin molestar el juego.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  limit: 30,               // 30 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera unos minutos' },
});
app.use('/api/auth', authLimiter, require('./src/routes/auth'));
app.use('/api/tables', require('./src/routes/tables'));
app.use('/api/players', require('./src/routes/players'));
app.use('/api/hands', require('./src/routes/hands'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/tournaments', require('./src/routes/tournaments'));
app.use('/api/clubs', require('./src/routes/clubs'));

// ── Digital Asset Links (para el APK/TWA sin barra del navegador) ──
// El contenido (con la huella SHA-256 de la firma del APK) se configura en la
// variable de entorno ASSETLINKS_JSON. Debe ir ANTES del fallback SPA.
app.get('/.well-known/assetlinks.json', (req, res) => {
  const raw = process.env.ASSETLINKS_JSON;
  if (!raw) return res.status(404).json({ error: 'assetlinks no configurado' });
  try {
    res.type('application/json').send(JSON.stringify(JSON.parse(raw)));
  } catch {
    // Si no es JSON válido, lo mandamos tal cual (por si pegan el archivo crudo)
    res.type('application/json').send(raw);
  }
});

// ── Servir la web compilada (producción) ───────────────────────────
// En desarrollo, Vite sirve el frontend y hace proxy de /api hacia aquí,
// así que este bloque solo actúa cuando existe `web/dist` (tras compilar).
const distPath = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // React Router: cualquier GET que no sea API devuelve index.html.
  // Middleware sin patrón de ruta (compatible con Express 5).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  log.error('unhandled request error', { path: req.path, method: req.method, err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin } });
initSockets(io);

const PORT = process.env.PORT || 4000;

// Safety net: a bug in one hand must not kill the whole server
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err: err.message, stack: err.stack });
});
process.on('unhandledRejection', (err) => {
  log.error('unhandledRejection', { err: err?.message || String(err), stack: err?.stack });
});

setupDb()
  .then(async () => {
    // Auto-provisionamiento (admin/bots/mesa) idempotente para bases nuevas
    try { await require('./src/config/bootstrap')(); } catch (e) { console.error('[bootstrap]', e.message); }
    server.listen(PORT, () => log.info('server listening', { port: PORT, env: process.env.NODE_ENV || 'development' }));
    // Reprogramar torneos con inicio por fecha/hora tras un reinicio
    try { require('./src/controllers/tournamentsController').initScheduler(); } catch (e) { console.error('[Torneos] scheduler:', e.message); }
    // Restaurar torneos que estaban en curso (persistencia ante reinicios)
    try { require('./src/engine/tournamentManager').resumeTournaments(); } catch (e) { console.error('[Torneos] resume:', e.message); }
    // Reembolsar los stacks de las mesas cash que quedaron en RAM al reiniciar
    try { await require('./src/engine/cashPersistence').resumeCashTables(); } catch (e) { console.error('[Cash] resume:', e.message); }
    // Watchdog: cada 15s revisa que ninguna mesa quede colgada (mano atascada)
    // y la reactiva. Red de seguridad ante cualquier cuelgue del motor.
    const gsm = require('./src/engine/gameStateMachine');
    setInterval(() => { try { gsm.watchdogTick(); } catch (e) { console.error('[watchdog]', e.message); } }, 15000);
  })
  .catch(err => {
    console.error('[DB] Setup failed:', err);
    process.exit(1);
  });
