import { useState, useEffect } from 'react';
import { api, type Prediction, type PredictionResponse } from '../lib/api';

interface PlayerPredictionsProps {
  userId: string;
  playerName: string;
  isActive?: boolean;
}

export function PlayerPredictions({ userId, isActive = false }: PlayerPredictionsProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadPredictions = async () => {
    if (predictions.length > 0) return; // Avoid duplicate calls
    
    setLoading(true);
    setError(null);
    
    try {
      const response: PredictionResponse = await api.getPredictions(userId);
      
      if (response.success && response.predictions) {
        setPredictions(response.predictions);
      } else {
        setError(response.message || 'No predictions available');
      }
    } catch (err) {
      setError('Failed to load predictions');
      console.error('Prediction error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load para jugadores activos
  useEffect(() => {
    if (isActive) {
      loadPredictions();
    }
  }, [isActive, userId]);

  if (loading) {
    return (
      <div className="mt-2 p-2 bg-purple-900/20 rounded text-xs">
        <div className="text-purple-300 animate-pulse">🔮 Loading predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 p-2 bg-gray-700/20 rounded text-xs">
        <div 
          className="text-gray-400 cursor-pointer hover:text-gray-300"
          onClick={loadPredictions}
          title="Click to retry"
        >
          🔮 Click to predict activity
        </div>
      </div>
    );
  }

  if (predictions.length === 0 && !isActive) {
    return (
      <div className="mt-2 p-2 bg-gray-700/20 rounded text-xs">
        <div 
          className="text-gray-400 cursor-pointer hover:text-purple-300 transition-colors"
          onClick={loadPredictions}
          title="Generate predictions for this player"
        >
          🔮 Predict activity
        </div>
      </div>
    );
  }

  if (predictions.length === 0) {
    return null;
  }

  const topPrediction = predictions[0];
  const nextFewPredictions = predictions.slice(0, 3);

  return (
    <div className="mt-2 p-2 bg-purple-900/20 rounded text-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="text-purple-300 font-semibold">🔮 Predictions</div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-purple-400 hover:text-purple-300 text-xs"
        >
          {showDetails ? '▼' : '▶'}
        </button>
      </div>

      {/* Predicción principal */}
      <div className="text-purple-200 mb-1">
        <span className="font-mono font-semibold">
          {topPrediction.time}
        </span>
        <span className="ml-2 text-purple-300">
          {Math.round(topPrediction.probability * 100)}%
        </span>
        {topPrediction.hours_from_now < 3 && (
          <span className="ml-1 text-orange-400 font-semibold">⚡</span>
        )}
      </div>

      {/* Confianza */}
      <div className="text-purple-400 text-xs mb-1">
        Confidence: {topPrediction.confidence}
      </div>

      {/* Detalles expandibles */}
      {showDetails && (
        <div className="mt-2 space-y-1 border-t border-purple-700/50 pt-2">
          <div className="text-purple-400 font-semibold text-xs mb-1">
            Next sessions:
          </div>
          {nextFewPredictions.map((pred, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-purple-200">
                {pred.time} ({pred.day.slice(0, 3)})
              </span>
              <span className="text-purple-300">
                {Math.round(pred.probability * 100)}%
              </span>
            </div>
          ))}
          
          {/* Reasoning */}
          {topPrediction.reasoning && (
            <div className="mt-2 pt-1 border-t border-purple-700/30">
              <div className="text-purple-400 text-xs opacity-75">
                {topPrediction.reasoning}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hook para usar predicciones
export function usePredictions(userId: string) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.getPredictions(userId);
      if (response.success) {
        setPredictions(response.predictions || []);
      } else {
        setError(response.message || 'No predictions available');
      }
    } catch (err) {
      setError('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  return {
    predictions,
    loading,
    error,
    fetchPredictions,
    topPrediction: predictions[0] || null,
    hasData: predictions.length > 0
  };
}
