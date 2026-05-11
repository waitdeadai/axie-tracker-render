import { useState } from 'react';
import { Prediction, SessionSummary, getPredictions, getSessionSummary } from '../lib/api';

interface MLPredictionHoverProps {
  userId: string;
  playerName: string;
}

export function MLPredictionHover({ userId }: MLPredictionHoverProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const fetchPredictions = async () => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [predictionsResponse, summaryResponse] = await Promise.all([
        getPredictions(userId),
        getSessionSummary(userId)
      ]);
      
      setPredictions(predictionsResponse.predictions || []);
      setSummary(summaryResponse.summary || null);
      setHasData(predictionsResponse.predictions.length > 0 || summaryResponse.summary?.total_sessions > 0);
    } catch (err) {
      setError('Failed to load predictions');
      setHasData(false);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    fetchPredictions();
  };

  const renderTooltipContent = () => {
    if (loading) {
      return (
        <div className="text-xs text-gray-300">
          Loading predictions...
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-xs text-red-300">
          {error}
        </div>
      );
    }

    if (!hasData) {
      return (
        <div className="text-xs text-gray-300">
          <div className="font-medium mb-1">No predictions yet</div>
          <div>Need 3+ sessions to predict patterns</div>
        </div>
      );
    }

    return (
      <div className="text-xs">
        {/* Session Summary */}
        {summary && (
          <div className="mb-2 pb-2 border-b border-gray-600">
            <div className="font-medium text-blue-300 mb-1">Sessions: {summary.total_sessions}</div>
            {summary.favorite_hours && summary.favorite_hours.length > 0 && (
              <div className="text-gray-300">
                Favorite hours: {summary.favorite_hours.map(h => `${h}:00`).join(', ')}
              </div>
            )}
          </div>
        )}
        
        {/* Predictions */}
        {predictions.length > 0 ? (
          <div>
            <div className="font-medium text-green-300 mb-1">Next likely sessions:</div>
            {predictions.slice(0, 3).map((pred, index) => (
              <div key={index} className="flex justify-between items-center mb-1">
                <span className="text-gray-300">{pred.time}</span>
                <span className={`font-medium ${
                  pred.confidence === 'High' ? 'text-green-400' : 
                  pred.confidence === 'Medium' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {pred.probability}%
                </span>
              </div>
            ))}
            {predictions[0] && (
              <div className="mt-2 pt-2 border-t border-gray-600 text-gray-400 text-xs">
                Confidence: {predictions[0].confidence}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-300">
            No predictions available
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative group">
      <span 
        className="cursor-help text-purple-400 hover:text-purple-300 transition-colors"
        onMouseEnter={handleMouseEnter}
      >
        🔮
      </span>
      
      {/* Tooltip */}
      <div className="absolute bottom-full right-0 mb-2 
                      bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-xl
                      opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      pointer-events-none z-[100] min-w-48 max-w-64">
        <div className="absolute -bottom-1 right-4
                        w-2 h-2 bg-gray-900 border-r border-b border-gray-600 
                        rotate-45"></div>
        {renderTooltipContent()}
      </div>
    </div>
  );
}
