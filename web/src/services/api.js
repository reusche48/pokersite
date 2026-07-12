import axios from 'axios';
import { getFingerprint } from '../lib/fingerprint';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  // Huella de dispositivo en cada petición (el servidor la usa en el login de invitado)
  const fp = getFingerprint();
  if (fp) cfg.headers['X-Fingerprint'] = fp;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('player');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
