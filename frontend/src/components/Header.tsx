import { formatCurrentTime } from '../utils/time';
import { UserMenu } from './UserMenu';
import type { SortOption } from '../App';

interface HeaderProps {
  updatedAt: string;
  rps: number;
  etaSeconds: number;
  playerCount: number;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showTop100Only: boolean;
  onToggleTop100: (show: boolean) => void;
  topRange: 'top200' | 'top300';
  onTopRangeChange: (range: 'top200' | 'top300') => void;
}

export function Header({ updatedAt, rps, etaSeconds, playerCount, sortBy, onSortChange, showTop100Only, onToggleTop100, topRange, onTopRangeChange }: HeaderProps) {
  return (
    <header className={`border-b transition-all duration-300 ${
      sortBy === 'sniper' 
        ? 'bg-gradient-to-r from-gray-900 to-red-950 border-red-700/50' 
        : showTop100Only
          ? 'bg-gradient-to-r from-gray-900 to-blue-950 border-blue-700/30'
          : 'bg-gray-800 border-gray-700'
    }`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">
                Axie MVP - {showTop100Only ? 'Top 100' : topRange === 'top300' ? 'Top 300' : 'Top 200'} Active Players
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Top 100 Toggle */}
              <div className="flex items-center">
                <div className="flex items-center h-7 w-24">
                  {showTop100Only && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 border border-blue-500/30 rounded-md mr-3">
                      <span className="text-blue-400 text-xs font-semibold tracking-wide">TOP 100</span>
                    </div>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={showTop100Only}
                    onChange={(e) => onToggleTop100(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-14 h-7 rounded-full transition-all duration-300 ${
                    showTop100Only 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-500/25' 
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
                      showTop100Only ? 'translate-x-7' : 'translate-x-0'
                    } shadow-lg flex items-center justify-center`}>
                      <span className="text-xs">
                        {showTop100Only ? '💯' : '2️⃣'}
                      </span>
                    </div>
                  </div>
                </label>
              </div>

              {/* Top Range Toggle */}
              <div className="flex items-center">
                <div className="flex items-center h-7 w-20">
                  {topRange === 'top300' && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 border border-purple-500/30 rounded-md mr-3">
                      <span className="text-purple-400 text-xs font-semibold tracking-wide">TOP 300</span>
                    </div>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={topRange === 'top300'}
                    onChange={(e) => onTopRangeChange(e.target.checked ? 'top300' : 'top200')}
                    className="sr-only"
                  />
                  <div className={`w-14 h-7 rounded-full transition-all duration-300 ${
                    topRange === 'top300' 
                      ? 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-lg shadow-purple-500/25' 
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
                      topRange === 'top300' ? 'translate-x-7' : 'translate-x-0'
                    } shadow-lg flex items-center justify-center`}>
                      <span className="text-xs">
                        {topRange === 'top300' ? '3️⃣' : '2️⃣'}
                      </span>
                    </div>
                  </div>
                </label>
              </div>

              {/* Sniper Mode Toggle */}
              <div className="flex items-center">
                <div className="flex items-center h-7 w-36">
                  {sortBy === 'sniper' && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-600/20 border border-red-500/30 rounded-md mr-3">
                      <span className="text-red-400 text-xs font-semibold tracking-wide">🎯 SNIPER MODE</span>
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={sortBy === 'sniper'}
                    onChange={(e) => onSortChange(e.target.checked ? 'sniper' : 'rank')}
                    className="sr-only"
                  />
                  <div className={`w-14 h-7 rounded-full transition-all duration-300 ${
                    sortBy === 'sniper' 
                      ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-500/25' 
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
                      sortBy === 'sniper' ? 'translate-x-7' : 'translate-x-0'
                    } shadow-lg flex items-center justify-center`}>
                      <span className="text-xs transform translate-x-0.5 -translate-y-0.5">
                        {sortBy === 'sniper' ? '🎯' : '🏆'}
                      </span>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-3 lg:gap-4">
              <div>
                {sortBy === 'sniper' ? 'Targets' : showTop100Only ? 'Top 100' : topRange === 'top300' ? 'Top 300' : 'Top 200'}: <span className="font-semibold text-white">{playerCount}</span>
              </div>
              <div className="hidden sm:block">
                RPS: <span className="font-semibold text-white">{rps}</span>
              </div>
              <div className="hidden md:block">
                ETA: <span className="font-semibold text-white">{etaSeconds}s</span>
              </div>
              <div className="hidden lg:block">
                Updated: <span className="font-mono text-xs">{formatCurrentTime(new Date(updatedAt).getTime())}</span>
              </div>
            </div>
            <div className="border-l border-gray-700 pl-3 lg:pl-4">
              <UserMenu />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}