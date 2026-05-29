import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from './lib/api';
import { Header } from './components/Header';
import { PlayerCard } from './components/PlayerCard';
import { RivalRadar } from './components/RivalRadar';

export type SortOption = 'rank' | 'sniper';

function App() {
  const [sortBy, setSortBy] = useState<SortOption>('rank');
  const [showTop100Only, setShowTop100Only] = useState<boolean>(false);
  const [displayRange, setDisplayRange] = useState<'top200' | 'top300'>('top200');
  const { data, isLoading, error } = useQuery({
    queryKey: ['active-players'],
    queryFn: api.getActivePlayers,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    initialData: {
      updatedAt: new Date().toISOString(),
      rps: 0,
      etaSeconds: 0,
      players: [],
    }
  });

  const { players = [], updatedAt, rps = 0, etaSeconds = 0 } = data ?? {
    updatedAt: new Date().toISOString(),
    rps: 0,
    etaSeconds: 0,
    players: [],
  };

  const handleTopRangeChange = (newRange: 'top200' | 'top300') => {
    setDisplayRange(newRange);
  };

  const sortedPlayers = useMemo(() => {
    if (!players || players.length === 0) return [];
    
    // Debug: Log de jugadores recibidos
    console.log(`📊 Frontend: Recibidos ${players.length} jugadores, displayRange: ${displayRange}`);
    const topRankRange = players.map(p => p.topRank).sort((a, b) => a - b);
    console.log(`📊 Frontend: Rango de topRank: ${topRankRange[0]} - ${topRankRange[topRankRange.length - 1]}`);
    
    let playersCopy = [...players];
    
    // Filtrar por rango de visualización
    if (showTop100Only) {
      playersCopy = playersCopy.filter(player => player.topRank <= 100);
    } else if (displayRange === 'top200') {
      playersCopy = playersCopy.filter(player => player.topRank <= 200);
    } else {
      // displayRange === 'top300' - mostrar todos (hasta 300)
      playersCopy = playersCopy.filter(player => player.topRank <= 300);
    }
    
    // Debug: Log después del filtrado
    console.log(`📊 Frontend: Después del filtrado: ${playersCopy.length} jugadores`);
    
    // Ordenar según el modo seleccionado
    switch (sortBy) {
      case 'sniper':
        // Sniper Mode: Ordenar por tiempo de batalla más reciente (descendente)
        return playersCopy.sort((a, b) => b.battleEndedAt - a.battleEndedAt);
      case 'rank':
      default:
        // Modo normal: Ordenar por ranking (ascendente - menor número = mejor posición)
        return playersCopy.sort((a, b) => a.topRank - b.topRank);
    }
  }, [players, sortBy, showTop100Only, displayRange]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading active players...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Connection Error
          </h2>
          <p className="text-gray-400 mb-4">
            Could not connect to server
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header 
        updatedAt={updatedAt}
        rps={rps}
        etaSeconds={etaSeconds}
        playerCount={sortedPlayers.length}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showTop100Only={showTop100Only}
        onToggleTop100={setShowTop100Only}
        topRange={displayRange}
        onTopRangeChange={handleTopRangeChange}
      />
      
      <main className="max-w-7xl mx-auto p-4 lg:pt-20">
        <RivalRadar />
        {sortedPlayers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🎮</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              No Recent Matches
            </h2>
            <p className="text-gray-400">
              No active players in the last 5 minutes
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6 auto-rows-fr overflow-visible">
            {sortedPlayers.map((player) => (
              <PlayerCard key={player.userId} player={player} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
