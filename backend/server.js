require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const setupDb = require('./src/config/setupDb');
const initSockets = require('./src/sockets');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/tables', require('./src/routes/tables'));
app.use('/api/players', require('./src/routes/players'));
app.use('/api/hands', require('./src/routes/hands'));

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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
initSockets(io);

const PORT = process.env.PORT || 4000;

// Safety net: a bug in one hand must not kill the whole server
process.on('uncaughtException', (err) => {
  console.error('[FATAL-caught]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[REJECTION-caught]', err);
});

setupDb()
  .then(() => {
    server.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('[DB] Setup failed:', err);
    process.exit(1);
  });
