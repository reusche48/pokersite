# Operaciones — PokerSite

Guía para desplegar, operar y escalar. Complementa `DEPLOY.md` (arranque) y
`MASTER_PLAN.md` (roadmap).

## Arranque

- **Backend:** `cd backend && npm ci && npm start` (necesita MySQL/MariaDB).
  El esquema se crea/migra solo al arrancar (`setupDb`), es idempotente.
- **Web:** `cd web && npm ci && npm run build` → el backend sirve `web/dist`.
- **Docker (todo junto):** `docker build -t pokersite . && docker run -p 4000:4000 --env-file backend/.env pokersite`.
- **Tests del motor:** `cd backend && npm test` (runner nativo de Node, sin deps).

## Variables de entorno

Ver `backend/.env.example`. Las críticas en producción:

| Variable | Para qué |
|---|---|
| `JWT_SECRET` | Firmar los JWT. **Cadena larga y aleatoria.** |
| `ADMIN_PASSWORD` | Contraseña del admin inicial. Si falta, se genera aleatoria (una vez, al log). **Nunca dejar la default.** |
| `TRUST_PROXY_HOPS` | Nº de proxies (Railway = 1). Hace que `req.ip` sea real y no falsificable. |
| `ALLOWED_ORIGINS` | Lista blanca de CORS en prod (coma-separada). Vacío = abierto. |
| `NODE_ENV=production` | Activa logs en JSON y modo prod. |
| `APP_URL` | Base para los enlaces de recuperación de contraseña. |

## Health check

- `GET /health` → `200 {status:"ok"}` si el proceso y la DB responden; `503` si
  la DB está caída. Úsalo como readiness/liveness probe (el Dockerfile ya lo hace).

## Observabilidad

- Logs estructurados (JSON por línea en `NODE_ENV=production`) en arranque,
  errores no controlados y el error handler. Migración incremental del resto de
  `console.*` a `src/config/logger.js`.
- **Pendiente (opcional):** métricas Prometheus (`prom-client`): sockets activos,
  manos/min, latencia de DB.

## Backups y rollback (⚠️ configurar en la plataforma)

El código no gestiona backups; se hacen a nivel de base de datos y plataforma:

- **Backups:** activa los backups automáticos de la base de datos gestionada
  (Railway MySQL / PlanetScale / RDS). Programa un `mysqldump` diario adicional a
  almacenamiento frío y **prueba el restore** periódicamente (un backup no
  probado no es un backup).
- **Rollback de despliegue:** en Railway, "Redeploy" del build anterior. Como el
  esquema es aditivo (solo `CREATE IF NOT EXISTS` / `ADD COLUMN`), un rollback de
  código no rompe la base. Evita migraciones destructivas sin plan de reversa.
- **Persistencia de estado en caliente:** los torneos y las mesas cash persisten
  su estado y se rehidratan/reembolsan al reiniciar; un deploy no destruye fichas.

## Escala horizontal (cuando un proceso se quede corto)

Hoy el estado (mesas, torneos, sockets) vive en la RAM de **un** proceso. Para
correr varias instancias hacen falta dos cosas:

1. **Redis adapter de Socket.io** para que los eventos crucen procesos:
   ```bash
   cd backend && npm i @socket.io/redis-adapter redis
   ```
   Y en `src/sockets/index.js`, si `process.env.REDIS_URL`, crear el adapter y
   `io.adapter(...)`. La variable `REDIS_URL` ya está prevista en `.env.example`.
2. **Sticky sessions** en el balanceador (el fallback de polling las exige), o
   forzar `transports: ['websocket']` en el cliente.
3. **Bots in-process** en vez de sockets loopback (para que un bot no caiga en
   otra instancia que la de su mesa).

Además, particionar `hand_history` por mes cuando crezca (MariaDB `PARTITION BY
RANGE`), y mover tareas pesadas a una cola.

## Funciones que necesitan infraestructura externa (scaffold listo)

- **Recuperación de contraseña / verificación de email:** el backend genera el
  token y arma el enlace; falta conectar un proveedor de email (SendGrid/SES) en
  `authController.forgotPassword` (hoy el enlace va al log en dev).
- **Notificaciones push:** requiere claves VAPID y un service-worker de push.
- **Cajero de dinero real:** requiere licencia, KYC/AML, RNG certificado y las
  pasarelas (Culqi/Stripe) con webhooks idempotentes — proyecto regulado aparte.

## Lo que queda como trabajo mayor (no bloqueante)

- i18n completo (hoy español; framework a introducir).
- Variantes reales (Omaha/Stud/PLO): hay carpetas vacías, bloqueadas en el
  controlador; requieren evaluador y reparto por variante.
- Modalidades: Spin&Go, Zoom/fast-fold, hand-for-hand en la burbuja.
- Social: amigos, chat privado; sistema VIP/misiones; leaderboards.
