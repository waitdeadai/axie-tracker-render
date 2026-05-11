import { ActivePlayer } from '../lib/api';
import { formatGameTime, formatDetailedTime } from '../utils/time';
import { MLPredictionHover } from './MLPredictionHover';
import { useAxieImages } from '../hooks/useAxieImages';
import { AxieImgUrl } from './AxieImgUrl';

interface PlayerCardProps {
  player: ActivePlayer;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const cardClasses = `card bg-gray-800 border ${
    player.recent ? 'border-green-500' : 'border-gray-700'
  } rounded-lg p-4 shadow-lg hover:scale-105 transition-transform duration-200 w-full h-full flex flex-col`;

  // Obtener imágenes de axies usando el hook
  const { fighters: imgs } = useAxieImages(player.userId, true);
  const visibleAxies = imgs && imgs.length > 0 ? imgs.slice(0, 3) : null;

  return (
    <div className={cardClasses}>
      {/* Header con rank, resultado y vstars */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="badge badge-rank flex-shrink-0">
          #{player.topRank}
        </span>
        <span 
          className={`badge ${player.rankChange > 0 ? 'badge-success' : 'badge-error'} flex-shrink-0`}
        >
          {player.rankChange > 0 ? '↑' : '↓'}{Math.abs(player.rankChange)}
        </span>
        {player.lastVstar !== undefined && player.lastVstar !== player.vstar && (
          <span 
            className={`badge ${player.vstar > player.lastVstar ? 'badge-success' : 'badge-error'} flex-shrink-0`}
          >
            ✨{Math.abs(player.vstar - player.lastVstar)}
          </span>
        )}
        <span className="badge badge-vstar flex-shrink-0">
          ⭐ {player.vstar}
        </span>
      </div>

      {/* Nombre del jugador */}
      <h3 className="font-semibold text-white mb-1 truncate" title={player.name}>
        <a 
          href={`https://axie.top/profile/${player.userId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 transition-colors duration-200"
        >
          {player.name}
        </a>
      </h3>

      {/* Badge de estado activo */}
      {player.recent && (
        <div className="mb-2">
          <span className="badge badge-success text-xs">
            Active
          </span>
        </div>
      )}

      {/* Hora de la partida, ML Predictions y último oponente */}
      <div className="flex items-center justify-between mb-2">
        <div 
          className="text-sm text-gray-400 cursor-help"
          title={formatDetailedTime(player.battleEndedAt)}
        >
          <span className="font-mono">
            {formatGameTime(player.battleEndedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MLPredictionHover 
            userId={player.userId}
            playerName={player.name}
          />
        </div>
      </div>

      {/* Imágenes de axies */}
      <div className="grid grid-cols-3 gap-2 flex-1 mt-2">
        {visibleAxies ? visibleAxies.map((ax, index) => (
          <div 
            key={ax.axieID || index} 
            className="aspect-square bg-gray-700 rounded-lg overflow-hidden min-h-0 flex items-center justify-center"
          >
            <AxieImgUrl
              primary={ax.primary}
              fallback={ax.fallback}
              alt={`Axie ${ax.axieID || index + 1}`}
              size={72}
            />
          </div>
        )) : [0, 1, 2].map((index) => (
          <div 
            key={index} 
            className="aspect-square bg-gray-700 rounded-lg overflow-hidden min-h-0 flex items-center justify-center"
          >
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-pulse bg-gray-600 w-full h-full" />
            </div>
          </div>
        ))}
      </div>


    </div>
  );
}
