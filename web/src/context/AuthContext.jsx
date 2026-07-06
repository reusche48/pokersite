import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

function tokenIsAdmin() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    return !!JSON.parse(atob(token.split('.')[1])).is_admin;
  } catch { return false; }
}

export function AuthProvider({ children }) {
  const [player, setPlayer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('player')); } catch { return null; }
  });
  const [isAdmin, setIsAdmin] = useState(tokenIsAdmin);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setIsAdmin(tokenIsAdmin()); }, [player]);

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

  function setAvatar(avatarConfig) {
    setPlayer(p => {
      if (!p) return p;
      const updated = { ...p, avatar_config: avatarConfig };
      localStorage.setItem('player', JSON.stringify(updated));
      return updated;
    });
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
    <AuthContext.Provider value={{ player, isAdmin, loading, guestLogin, login, register, logout, updateChips, setAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
