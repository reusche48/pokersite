# Desplegar PokerSite en Railway

El proyecto está armado como **un solo servicio**: el backend (Express) sirve el
frontend ya compilado (`web/dist`) + la API + los WebSockets en el mismo puerto.
No hace falta separar frontend y backend.

- Raíz `package.json`:
  - `build`: instala y compila el frontend, e instala el backend.
  - `start`: arranca el backend (que también sirve el frontend).
- `backend/server.js` usa `process.env.PORT` (Railway lo asigna solo) y crea/verifica
  el esquema de MySQL al arrancar (`setupDb`).

## Pasos

### 1. Crear el proyecto
1. Entra a https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Elige `reusche48/pokersite`. Railway detecta Node y usará `npm run build` + `npm start`.
   - Si no los toma automáticamente, ponlos a mano en **Settings → Build/Deploy**:
     - Build Command: `npm run build`
     - Start Command: `npm start`

### 2. Base de datos MySQL
1. En el proyecto: **New → Database → Add MySQL**.
2. Railway crea la base y expone variables (`MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`,
   `MYSQLPASSWORD`, `MYSQLDATABASE`).

### 3. Variables de entorno (en el servicio de la app → **Variables**)
Mapea las de MySQL a las que espera el backend (usa referencias de Railway):

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
JWT_SECRET=<genera-uno-nuevo-largo-y-aleatorio>
ADMIN_EMAIL=tu-correo@ejemplo.com
ADMIN_PASSWORD=<una-contraseña-fuerte>
NODE_ENV=production
APP_URL=https://<tu-app>.up.railway.app
```

Opcionales:
- `TRUST_PROXY_HOPS` — nº de proxies delante (Railway = **1**, que ya es el valor
  por defecto; solo cámbialo si tu topología es distinta). Hace que la IP del
  cliente sea real y no falsificable (anti-multicuenta).
- `ALLOWED_ORIGINS` — lista blanca de CORS. Como el frontend se sirve del mismo
  dominio, puedes dejarlo vacío.
- `APP_URL` — la URL pública; se usa en los enlaces de recuperación de contraseña.

- `ASSETLINKS_JSON` (opcional): solo si empaquetas la app como **APK** (ver
  `GET_THE_APP.md`). Pega aquí el contenido del `assetlinks.json` que da PWABuilder para
  que el APK abra sin barra del navegador. El backend lo sirve en
  `/.well-known/assetlinks.json`.

- **JWT_SECRET**: genera uno nuevo (NO reutilices el local). Ej.:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- **NO** pongas `PORT` a mano — Railway lo asigna.
- `CULQI_SECRET_KEY`, `CULQI_WEBHOOK_SECRET`, `STRIPE_*`: solo para pagos reales.
  Para probar el juego se pueden dejar sin poner (las recargas con tarjeta quedan
  deshabilitadas, pero el póker con fichas de práctica funciona).

### 4. Primer arranque — TODO automático ✅
Al desplegar, el backend **se auto-provisiona** (idempotente, solo si falta):
- Crea el **esquema** de la base (`[DB] Schema created/verified`).
- Crea el **admin** con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Define
  `ADMIN_PASSWORD`**: si no, se genera una contraseña **aleatoria de un solo uso**
  y se muestra en los logs (ya no se usa `admin123`).
- Siembra los **100 bots**.
- Crea una **Mesa Principal**.

No hay que correr scripts a mano. Verás en los logs: `[bootstrap] Admin listo…`,
`Sembrando 100 bots…`, `Mesa Principal creada.`

> Si cambias `ADMIN_PASSWORD` después, se **actualiza** la contraseña del admin
> en el siguiente reinicio (el bootstrap la resetea al valor del entorno).

### 5. Listo
Abre la URL pública que da Railway. El frontend, la API y los sockets viven en el
mismo dominio, así que todo conecta sin configuración extra.

## Notas
- **Migraciones automáticas:** el esquema (incluidas tablas y columnas nuevas —
  clubes/uniones, `hand_players`, `password_resets`, `token_version`, snapshots,
  índices) se crea/migra solo al arrancar (`setupDb`, idempotente). No hay que
  correr nada a mano.
- **Persistencia ante reinicios:** los **torneos en curso se rehidratan** y las
  **mesas cash reembolsan** los stacks al saldo (no se pierden fichas en un
  deploy). Los **bots** se re-siembran; el admin puede resentarlos si hace falta.
- **Build:** `railway.json` fija el builder a **Nixpacks** (`npm run build` +
  `npm start`) y usa `/health` como healthcheck. El `Dockerfile` de la raíz es
  solo para correr en Docker localmente, no lo usa Railway.
- Reglas de negocio (comisión, etc.) están en el backend; revisa `CLAUDE.md`.
