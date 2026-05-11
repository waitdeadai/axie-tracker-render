export const getApiBaseUrl = (): string => {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

  if (configuredApiUrl) {
    return `${configuredApiUrl.replace(/\/$/, '')}/api`;
  }

  if (import.meta.env.PROD) {
    return '/api';
  }

  return 'http://localhost:4000/api';
};

export const API_BASE = getApiBaseUrl();
