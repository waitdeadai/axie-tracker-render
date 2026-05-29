import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatExpiry(expiresAt: number | null): string | null {
  if (!expiresAt) return null;
  try {
    return new Date(expiresAt).toLocaleDateString();
  } catch {
    return null;
  }
}

export function UserMenu() {
  const { address, accessStatus, logout, isBusy } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!address) {
    return null;
  }

  const expiry = formatExpiry(accessStatus?.expiresAt ?? null);
  const whitelisted = accessStatus?.whitelisted;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center space-x-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
          <span className="w-2.5 h-2.5 bg-green-400 rounded-full" />
        </div>
        <span className="text-gray-300 hidden md:block font-mono text-sm">{shortAddress(address)}</span>
        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg py-1 z-10 border border-gray-700">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-xs text-gray-400">Ronin Wallet</p>
            <p className="text-sm text-white font-mono truncate">{address}</p>
            {whitelisted ? (
              <p className="text-xs text-purple-300 mt-1">Season whitelist</p>
            ) : expiry ? (
              <p className="text-xs text-green-400 mt-1">Access until {expiry}</p>
            ) : null}
          </div>
          <button
            onClick={() => void logout()}
            disabled={isBusy}
            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-60 flex items-center"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
