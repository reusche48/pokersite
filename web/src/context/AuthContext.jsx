import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [player, setPlayer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('player')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  async function guestLogin(nickname) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/guest', { nickname });
      localStorage.setItem('token', data.token);
      localStorage.setItem('player', JSON.stringify(data.player));
      setPlayer(data.player);
      return data.player;
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('player', JSON.stringify(data.player));
      setPlayer(data.player);
      return data.player;
    } finally {
      setLoading(false);
    }
  }

  async function register(nickname, email, password) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { nickname, email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('player', JSON.stringify(data.player));
      setPlayer(data.player);
      return data.player;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('player');
    setPlayer(null);
  }

  function updateChips(delta, chipMode) {
    setPlayer(p => {
      if (!p) return p;
      const updated = { ...p };
      if (chipMode === 'real') updated.real_chips = (parseFloat(updated.real_chips) + delta).toFixed(2);
      else updated.play_chips = (updated.play_chips || 0) + delta;
      localStorage.setItem('player', JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ player, loading, guestLogin, login, register, logout, updateChips }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
