import { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';
import { PayGate } from './PayGate';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { phase, hasAccess, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Verificando acceso…</p>
        </div>
      </div>
    );
  }

  // Not yet signed in with a wallet → connect / SIWE.
  if (phase !== 'authenticated') {
    return <LoginScreen />;
  }

  // Signed in but the wallet has no active subscription / whitelist → pay gate.
  if (!hasAccess) {
    return <PayGate />;
  }

  return <>{children}</>;
}
