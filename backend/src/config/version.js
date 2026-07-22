'use strict';

// Versión de la app: 1.0.<nº de commits> (+hash corto). Se deriva SOLA de git —
// nadie tiene que acordarse de subir el número. En producción (Railway) git no
// está disponible en runtime: el Dockerfile la inyecta como APP_VERSION en
// build-time; localmente se calcula al arrancar.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let version = process.env.APP_VERSION || null;

// En Docker: el build escribe .appversion (no hay git en runtime)
if (!version) {
  try {
    version = fs.readFileSync(path.join(__dirname, '../../.appversion'), 'utf8').trim() || null;
  } catch { /* no existe: seguimos */ }
}

// En desarrollo: derivarla de git al arrancar
if (!version) {
  try {
    const count = execSync('git rev-list --count HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    version = `1.0.${count} (${hash})`;
  } catch {
    version = '1.0.dev';
  }
}

module.exports = version;
