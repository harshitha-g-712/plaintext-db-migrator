import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState } from '../types';
import { authService } from '../services/auth.service';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: 'ADMIN' | 'DEVELOPER') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('access_token'),
    isAuthenticated: false,
    isLoading: true,
  });

  // On mount — verify existing token
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    authService.getMe()
      .then((user) => setState({ user, token, isAuthenticated: true, isLoading: false }))
      .catch(() => {
        localStorage.removeItem('access_token');
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token, user } = await authService.login({ email, password });
    localStorage.setItem('access_token', access_token);
    setState({ user, token: access_token, isAuthenticated: true, isLoading: false });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role?: 'ADMIN' | 'DEVELOPER') => {
    await authService.register({ name, email, password, role });
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
