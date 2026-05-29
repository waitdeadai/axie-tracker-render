import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getAccessStatus,
  logout as apiLogout,
  TokenManager,
  decodeJwtPayload,
  type AccessStatus
} from '../lib/api';
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  isRoninWalletInstalled
} from '../lib/wallet';
import { siweSignIn } from '../lib/siwe';

export type AuthPhase = 'connect' | 'sign-in' | 'authenticated';

interface AuthContextType {
  phase: AuthPhase;
  address: string | null;
  accessStatus: AccessStatus | null;
  hasAccess: boolean;
  // Watchlist + alerts tiering. Default false when there's no access status.
  watchlistAccess: boolean;
  watchlistFree: boolean;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  walletInstalled: boolean;
  connect: () => Promise<void>;
  signIn: () => Promise<void>;
  refreshAccess: () => Promise<AccessStatus | null>;
  logout: () => Promise<void>;
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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Error desconocido';
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletInstalled = isRoninWalletInstalled();

  const refreshAccess = useCallback(async (): Promise<AccessStatus | null> => {
    const status = await getAccessStatus();
    setAccessStatus(status);
    if (status) {
      setAddress(status.address);
    }
    return status;
  }, []);

  // On boot: if a valid JWT is present the wallet was already signed in this
  // session, so reconcile the live on-chain access status. Otherwise reflect
  // whether the wallet is at least still connected (so we can skip straight to
  // the sign-in step instead of re-asking to connect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = TokenManager.getToken();
        if (token && !TokenManager.isTokenExpired(token)) {
          const status = await getAccessStatus();
          if (cancelled) return;
          if (status) {
            setAccessStatus(status);
            setAddress(status.address);
            return;
          }
          // JWT outlived the server session; fall back to wallet detection.
          TokenManager.removeToken();
        } else if (token) {
          TokenManager.removeToken();
        }

        if (decodeJwtPayload(token ?? '')) {
          // no-op: payload inspected only to keep helper exercised
        }

        const connected = await getConnectedAddress();
        if (cancelled) return;
        if (connected) {
          setAddress(connected);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const { address: connected } = await connectWallet();
      setAddress(connected);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      let active = address;
      if (!active) {
        const { address: connected } = await connectWallet();
        active = connected;
        setAddress(connected);
      }
      const result = await siweSignIn(active);
      setAccessStatus({
        address: result.address,
        hasAccess: result.hasAccess,
        plan: result.plan,
        expiresAt: result.expiresAt,
        whitelisted: result.whitelisted,
        watchlistAccess: result.watchlistAccess,
        watchlistFree: result.watchlistFree
      });
      setAddress(result.address);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }, [address]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    try {
      await apiLogout();
      await disconnectWallet();
    } catch {
      // best-effort
    } finally {
      setAddress(null);
      setAccessStatus(null);
      setError(null);
      setIsBusy(false);
    }
  }, []);

  const phase: AuthPhase = accessStatus ? 'authenticated' : address ? 'sign-in' : 'connect';

  return (
    <AuthContext.Provider
      value={{
        phase,
        address,
        accessStatus,
        hasAccess: accessStatus?.hasAccess ?? false,
        watchlistAccess: accessStatus?.watchlistAccess ?? false,
        watchlistFree: accessStatus?.watchlistFree ?? false,
        isLoading,
        isBusy,
        error,
        walletInstalled,
        connect,
        signIn,
        refreshAccess,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
