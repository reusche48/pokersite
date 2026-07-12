import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureFingerprint } from './lib/fingerprint'

// Calcula la huella de dispositivo al arrancar (para auth y detección de multicuenta)
ensureFingerprint().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
