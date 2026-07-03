# 🚀 Guía de despliegue de PokerSite en Railway

Esta guía es para desplegar el proyecto en internet usando **Railway** (https://railway.app).
El proyecto ya está preparado: el backend (Node.js) sirve también la web (React), así que
**todo corre en un solo servicio con un solo enlace**.

---

## 📋 Lo que necesitas antes de empezar

1. Una cuenta de **GitHub** (https://github.com) — gratis.
2. Una cuenta de **Railway** (https://railway.app) — se entra con GitHub. Requiere tarjeta (plan de pago, ~$5/mes de uso).
3. El proyecto subido a un repositorio de GitHub (pasos abajo).
4. Los **secretos** (contraseñas y llaves) que el dueño te pasará **por privado** — NO están en el código.

---

## PASO 1 — Subir el proyecto a GitHub

Desde la carpeta del proyecto (`C:\pokersite`), en una terminal:

```bash
git init
git add .
git commit -m "PokerSite - versión inicial"
```

Luego crea un repositorio **privado** en https://github.com/new (recomendado privado, no público),
y conéctalo:

```bash
git remote add origin https://github.com/TU-USUARIO/pokersite.git
git branch -M main
git push -u origin main
```

> ✅ El archivo `.gitignore` ya protege los secretos: el `.env`, `node_modules` y los archivos
> de prueba **no se suben**. Verifica que en GitHub **no aparezca** el archivo `backend/.env`.

---

## PASO 2 — Crear el proyecto en Railway

1. Entra a https://railway.app e inicia sesión con GitHub.
2. **New Project** → **Deploy from GitHub repo** → elige `pokersite`.
3. Railway detectará Node.js y empezará a construir. Usará automáticamente:
   - Construir: `npm run build` (compila la web e instala el backend)
   - Arrancar: `npm start`

---

## PASO 3 — Agregar la base de datos MySQL

1. Dentro del proyecto en Railway: **New** → **Database** → **Add MySQL**.
2. Railway crea la base de datos y genera sus credenciales automáticamente.

---

## PASO 4 — Configurar las variables de entorno

En el servicio del **backend** (no en la base de datos), ve a la pestaña **Variables** y agrega:

| Variable | Valor |
|---|---|
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` |
| `DB_USER` | `${{MySQL.MYSQLUSER}}` |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
| `DB_NAME` | `${{MySQL.MYSQLDATABASE}}` |
| `JWT_SECRET` | *(una cadena larga y aleatoria — el dueño te la da, o genera una)* |
| `CULQI_SECRET_KEY` | *(la que te pase el dueño, si usarán pagos reales)* |
| `CULQI_WEBHOOK_SECRET` | *(idem)* |

> Las de tipo `${{MySQL.XXXX}}` son **referencias** — Railway las reemplaza solo con los datos
> reales de la base de datos que creaste. Escríbelas tal cual, con las llaves dobles.
>
> ⚠️ **NO pongas `PORT`** — Railway lo asigna solo. El código ya lo respeta.

---

## PASO 5 — Generar el dominio público

1. En el servicio backend: pestaña **Settings** → **Networking** → **Generate Domain**.
2. Railway te dará una URL tipo `https://pokersite-production.up.railway.app`.
3. Abre esa URL en el navegador → debe cargar la mesa de poker. 🃏

---

## 🔁 Actualizar después de un cambio

Cada vez que el dueño haga cambios y los suba a GitHub (`git push`),
Railway **redespliega solo**. No hay que hacer nada más.

---

## 🆘 Si algo falla

- **La web carga pero no conecta / "Conectando a la mesa..."** → revisa que las variables `DB_*`
  estén bien escritas y que el servicio MySQL esté activo.
- **Ver los errores** → en Railway, servicio backend → pestaña **Deployments** → **View Logs**.
- **Error de base de datos al arrancar** → casi siempre es una variable `DB_*` mal copiada.

---

## ⚖️ Nota importante sobre dinero real

Si se activa el modo de **fichas reales** (pagos con Culqi), el poker por dinero es una
actividad **regulada** en Perú y la mayoría de países. Eso requiere licencias y es un tema
legal aparte del despliegue. Con **fichas de juego (play money)** no hay ese problema.
