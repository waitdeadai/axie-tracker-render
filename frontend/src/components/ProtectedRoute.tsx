import { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { PayGate } from './PayGate';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { hasAccess, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Checking access…</p>
        </div>
      </div>
    );
  }

  // The PayGate landing is the single conversion screen for ANY non-access state:
  // it drives connect -> SIWE sign-in -> pay via one adaptive CTA.
  if (!hasAccess) {
    return <PayGate />;
  }

  return <>{children}</>;
}
