import { useAuth } from './AuthProvider';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function LoginScreen() {
  const { phase, address, isBusy, error, walletInstalled, connect, signIn } = useAuth();
  const needsSignIn = phase === 'sign-in';

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="text-blue-500 text-5xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold text-white mb-2">AXIE MVP</h2>
          <p className="text-gray-300 mb-8">
            {needsSignIn
              ? 'Firma el mensaje para iniciar sesión con tu wallet de Ronin.'
              : 'Conecta tu wallet de Ronin para acceder al panel de jugadores activos.'}
          </p>

          {needsSignIn && address && (
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/15 border border-blue-500/30 rounded-md">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-blue-300 text-sm font-mono">{shortAddress(address)}</span>
            </div>
          )}

          {!walletInstalled && !address ? (
            <a
              href="https://wallet.roninchain.com/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md w-full transition-colors"
            >
              Instalar Ronin Wallet
            </a>
          ) : (
            <button
              onClick={() => void (needsSignIn ? signIn() : connect())}
              disabled={isBusy}
              className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-md w-full transition-colors"
            >
              {isBusy ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  {needsSignIn ? 'Firmando…' : 'Conectando…'}
                </span>
              ) : needsSignIn ? (
                'Firmar e iniciar sesión'
              ) : (
                'Conectar Ronin Wallet'
              )}
            </button>
          )}

          {error && (
            <div className="mt-4 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="mt-6 text-gray-400 text-sm">
            Acceso por suscripción on-chain en Ronin (chainId 2020).
          </div>
        </div>
      </div>
    </div>
  );
}
