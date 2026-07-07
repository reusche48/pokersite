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
```

- **JWT_SECRET**: genera uno nuevo (NO reutilices el local). Ej.:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- **NO** pongas `PORT` a mano — Railway lo asigna.
- `CULQI_SECRET_KEY`, `CULQI_WEBHOOK_SECRET`, `STRIPE_*`: solo para pagos reales.
  Para probar el juego se pueden dejar sin poner (las recargas con tarjeta quedan
  deshabilitadas, pero el póker con fichas de práctica funciona).

### 4. Primer arranque
- Al desplegar, el backend **crea el esquema solo** (verás `[DB] Schema created/verified`).
- **Sembrar los 100 bots** (una vez): en el servicio de la app, abre una terminal /
  one-off command en Railway y corre:
  ```
  node backend/seedBots.js
  ```
  (o con la CLI: `railway run node backend/seedBots.js`)

### 5. Crear el administrador
- Regístrate normalmente en la web desplegada (crea tu cuenta).
- Marca esa cuenta como admin en la base (Railway → MySQL → Query):
  ```sql
  UPDATE players SET is_admin = 1 WHERE email = 'TU_CORREO';
  ```
- Usa una **contraseña fuerte** (no `123456`).

### 6. Listo
Abre la URL pública que da Railway. El frontend, la API y los sockets viven en el
mismo dominio, así que todo conecta sin configuración extra.

## Notas
- Los **bots viven en memoria**: si el servicio se reinicia, el admin los vuelve a
  sentar desde el panel (o por API). Los torneos en curso también se pierden al reiniciar.
- Reglas de negocio (comisión 20%, etc.) están en el backend; revisa `CLAUDE.md`.
