import { formatDistanceToNowStrict, formatDistance } from 'date-fns';
import { enUS } from 'date-fns/locale';

export function formatGameTime(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  // Si pasó menos de un minuto, mostrar segundos
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  // Si pasó menos de una hora, mostrar el tiempo exacto
  return formatDistanceToNowStrict(timestamp, {
    addSuffix: true,
    locale: enUS,
    unit: seconds < 3600 ? 'minute' : 'hour'
  });
}

// Para el header, mantener el formato HH:mm:ss
export function formatCurrentTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Para tooltips y detalles adicionales
export function formatDetailedTime(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp);
  
  return `${formatDistance(timestamp, now, { 
    addSuffix: true,
    locale: enUS 
  })} (${date.toLocaleTimeString('en-US', { 
    hour12: false 
  })})`;
}