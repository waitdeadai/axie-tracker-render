import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import {
  getAuthStatus,
  AuthStatus,
  TokenManager,
  decodeJwtPayload
} from '../lib/api';

interface AuthContextType {
  authStatus: AuthStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetchAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAuthStatus = async () => {
    try {
      setIsLoading(true);
      const status = await getAuthStatus();
      setAuthStatus(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error desconocido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const authError = urlParams.get('error');

    if (token) {
      try {
        const payload = decodeJwtPayload(token);
        if (!payload) {
          throw new Error('Invalid JWT payload');
        }

        TokenManager.setToken(token);
      } catch (_error) {
        TokenManager.removeToken();
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
        void fetchAuthStatus();
      }

      return;
    }

    if (authError) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    void fetchAuthStatus();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authStatus,
        isLoading,
        error,
        refetchAuthStatus: fetchAuthStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
