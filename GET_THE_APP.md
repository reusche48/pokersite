# Instalar PokerSite como app (APK Android + iPhone)

PokerSite ya es una **PWA** servida por HTTPS en producción. No hay que programar una app
nativa: se empaqueta el sitio en un **APK** (envoltorio TWA que abre el sitio en vivo a
pantalla completa). Cada actualización que suban a Railway se ve sola en la app.

- **URL de producción:** `https://pokersite-production.up.railway.app`
- Android → **APK** (se instala directo, sin Play Store).
- iPhone → **PWA** ("Agregar a inicio"); Apple no permite APK.

---

## A) Generar el APK (Android) — con PWABuilder (gratis, en el navegador)

1. Entra a **https://www.pwabuilder.com** y pega la URL de producción. Analiza.
2. Ve a la pestaña **Android** → **Package for stores**.
   - **Package ID:** `app.pokersite.twa`
   - **App name:** PokerSite
   - Deja el resto por defecto.
3. Descarga el `.zip`. Adentro viene:
   - `app-release-signed.apk` → **este es el APK** que repartes.
   - `assetlinks.json` → sirve para quitar la barra del navegador (paso B).
   - `signing.keystore` (+ contraseñas) → **¡GUÁRDALO!** Sin esta clave, una futura versión
     del APK se consideraría "otra app" y habría que reinstalar desde cero.

## B) Quitar la barra del navegador (acabado pulido)

Para que la app abra 100% sin barra del navegador, el sitio debe publicar la verificación
Digital Asset Links con la huella de tu APK (ya está el endpoint listo en el backend):

1. Abre el `assetlinks.json` que te dio PWABuilder y **copia todo su contenido**.
2. En **Railway → tu servicio → Variables**, crea:
   ```
   ASSETLINKS_JSON = <pega aquí el contenido del assetlinks.json>
   ```
3. **Redeploy**. Comprueba que responde:
   `https://pokersite-production.up.railway.app/.well-known/assetlinks.json`
4. Reinstala el APK en el celular → ya abre sin barra, a pantalla completa.

> Si te saltas el paso B, el APK igual funciona; solo se ve una barrita del navegador
> por ~1 segundo al abrir.

## C) Repartir a los amigos con Android

- Envía el `app-release-signed.apk` por **WhatsApp** (o Drive/Telegram).
- En el celular del amigo: al abrir el APK, Android pedirá permitir
  **"Instalar apps desconocidas"** para WhatsApp/Archivos → aceptar → Instalar.
- Listo: aparece el ícono de PokerSite como cualquier app.

## D) Amigos con iPhone (sin APK — es limitación de Apple)

1. Abrir `https://pokersite-production.up.railway.app` en **Safari** (no en Chrome).
2. Tocar el botón **Compartir** (cuadro con flecha ↑).
3. **Agregar a inicio** → Agregar.
4. Queda un ícono en la pantalla que abre la app a pantalla completa.

---

## Notas

- El APK/PWA es un **envoltorio del sitio en vivo**: necesita internet para jugar.
- No va a Google Play (eso requiere cuenta de desarrollador y revisión). Es instalación
  directa (sideload), perfecta para pruebas con amigos.
- Para actualizar la app: solo sube cambios a producción (Railway) — la app los toma sola.
  No hace falta repartir un APK nuevo salvo que cambies el ícono/nombre/manifest.
