import { ReactNode } from 'react';
import { logout } from '../lib/api';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authStatus, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Verificando autenticacion...</p>
        </div>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return <LoginScreen />;
  }

  if (!authStatus.authorized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">Locked</div>
          <h2 className="text-xl font-bold text-white mb-4">Acceso Restringido</h2>
          <p className="text-gray-300 mb-6">
            Tu cuenta de Discord no esta autorizada para acceder a esta aplicacion.
          </p>
          <p className="text-gray-400 text-sm mb-6">ID de usuario: {authStatus.user?.id}</p>
          <button
            onClick={() => void logout()}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
