#!/usr/bin/env python3
"""
Simple Session Predictor for Axie MVP
Predice cuándo es probable que un jugador esté activo basado en patrones históricos
"""

import sqlite3
import json
import sys
import os
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import math

class LocalSessionPredictor:
    def __init__(self, db_path=None):
        # Usar la variable de entorno DATA_DIR o path por defecto
        if db_path is None:
            data_dir = os.environ.get('DATA_DIR', './data')
            db_path = os.path.join(data_dir, 'sessions.db')
        self.db_path = db_path
        self.min_sessions = 3  # Mínimo para hacer predicciones básicas
        self.min_sessions_advanced = 8  # Mínimo para predicciones avanzadas
        
    def check_database(self):
        """Verificar si la base de datos existe y tiene datos"""
        if not os.path.exists(self.db_path):
            return False, "Database not found"
            
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM player_sessions")
            count = cursor.fetchone()[0]
            conn.close()
            return True, f"Database found with {count} sessions"
        except Exception as e:
            return False, f"Database error: {str(e)}"
    
    def get_user_patterns(self, user_id):
        """Análisis de patrones de un usuario específico"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Obtener sesiones de los últimos 30 días
        thirty_days_ago = int((datetime.now() - timedelta(days=30)).timestamp())
        
        cursor.execute("""
            SELECT
                (session_start / 1800) % 48,
                day_of_week,
                session_start,
                duration_minutes,
                vstar_change,
                top_rank
            FROM player_sessions
            WHERE user_id = ? AND session_start > ?
            ORDER BY session_start ASC
        """, (user_id, thirty_days_ago))
        
        sessions = cursor.fetchall()
        conn.close()
        
        if len(sessions) < self.min_sessions:
            return None
            
        return self.analyze_patterns(sessions)
    
    def analyze_patterns(self, sessions):
        """Análisis heurístico avanzado de patrones"""
        bucket_frequency = defaultdict(int)
        day_frequency = defaultdict(int)
        session_gaps = []
        total_playtime = 0
        vstar_changes = []

        # Análisis por bucket de 30 minutos
        bucket_activity = defaultdict(list)  # bucket -> [duraciones]
        day_activity = defaultdict(list)   # día -> [duraciones]

        for i, (bucket, day, start_time, duration, vstar_change, rank) in enumerate(sessions):
            bucket_frequency[bucket] += 1
            day_frequency[day] += 1
            total_playtime += duration

            bucket_activity[bucket].append(duration)
            day_activity[day].append(duration)

            if vstar_change != 0:
                vstar_changes.append(vstar_change)

            # Calcular gaps entre sesiones
            if i > 0:
                prev_session = sessions[i-1][2]  # previous start_time
                gap_hours = (start_time - prev_session) / 3600
                session_gaps.append(gap_hours)

        # Calcular buckets favoritos con intensidad
        favorite_buckets = self.calculate_weighted_preferences(bucket_frequency, bucket_activity)
        favorite_days = self.calculate_weighted_preferences(day_frequency, day_activity)

        # Estadísticas avanzadas
        avg_gap = sum(session_gaps) / len(session_gaps) if session_gaps else 24
        avg_duration = total_playtime / len(sessions)
        consistency_score = self.calculate_consistency(sessions)

        # Detectar buckets prime
        prime_buckets = self.detect_prime_buckets(bucket_frequency, bucket_activity)

        # Detectar rachas
        streak_info = self.detect_streak(sessions)

        return {
            'favorite_buckets': favorite_buckets,
            'favorite_days': favorite_days,
            'prime_buckets': prime_buckets,
            'average_gap_hours': avg_gap,
            'average_duration': avg_duration,
            'total_sessions': len(sessions),
            'total_playtime': total_playtime,
            'patterns_strength': min(len(sessions) / 5, 1.0),  # Max 1.0 at 5 sessions
            'consistency_score': consistency_score,
            'avg_vstar_change': sum(vstar_changes) / len(vstar_changes) if vstar_changes else 0,
            'last_session': sessions[-1][2] if sessions else 0,
            'streak': streak_info
        }
    
    def calculate_weighted_preferences(self, frequency, activity):
        """Calcula preferencias ponderadas por frecuencia y duración"""
        weighted_scores = {}
        
        for item, freq in frequency.items():
            total_duration = sum(activity[item])
            avg_duration = total_duration / len(activity[item])
            
            # Score = frecuencia * duración promedio normalizada
            weighted_scores[item] = freq * (avg_duration / 60)  # Normalizar por hora
        
        # Retornar top items ordenados por score
        return sorted(weighted_scores.items(), key=lambda x: x[1], reverse=True)
    
    def detect_prime_buckets(self, bucket_frequency, bucket_activity):
        """Detecta los buckets de 30 min de mayor actividad"""
        prime_buckets = []

        for bucket, freq in bucket_frequency.items():
            if freq >= 2:  # Al menos 2 sesiones
                total_duration = sum(bucket_activity[bucket])
                avg_duration = total_duration / len(bucket_activity[bucket])

                # Prime bucket si tiene alta frecuencia y duración decente
                if freq >= 3 or avg_duration >= 30:  # 3+ sesiones O 30+ min promedio
                    prime_buckets.append({
                        'bucket': bucket,
                        'frequency': freq,
                        'avg_duration': avg_duration,
                        'intensity': freq * avg_duration / 60
                    })

        return sorted(prime_buckets, key=lambda x: x['intensity'], reverse=True)

    def detect_streak(self, sessions):
        """Detecta rachas de días consecutivos."""
        if len(sessions) < 3:
            return {'current_streak': 0, 'longest_streak': 0, 'avg_streak': 0}

        # Get unique days from sessions (sessions are tuples: bucket, day_of_week, start_time, ...)
        days = sorted(set(s[1] for s in sessions))
        if not days:
            return {'current_streak': 0, 'longest_streak': 0, 'avg_streak': 0}

        # Calculate consecutive day streaks
        current_streak = 1
        longest_streak = 1
        for i in range(1, len(days)):
            if (days[i] - days[i-1]) == 1 or (days[i] == 0 and days[i-1] == 6):
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                current_streak = 1

        return {
            'current_streak': current_streak,
            'longest_streak': longest_streak,
            'avg_streak': round(sum(days) / len(days), 1)
        }
    
    def calculate_consistency(self, sessions):
        """Calcula qué tan consistente es el jugador"""
        if len(sessions) < 3:
            return 0.5
        
        # Consistencia basada en variación de gaps y horarios
        hours = [session[0] for session in sessions]
        hour_variance = self.calculate_variance(hours)
        
        # Score inverso de varianza (menos varianza = más consistente)
        consistency = max(0, 1 - (hour_variance / 144))  # 144 = varianza máxima teórica
        return min(consistency, 1.0)
    
    def calculate_variance(self, values):
        """Calcula varianza de una lista de valores"""
        if len(values) < 2:
            return 0
        
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        return variance
    
    def predict_next_session(self, user_id):
        """Predicción principal de próximas sesiones"""
        patterns = self.get_user_patterns(user_id)
        if not patterns:
            return None
        
        now = datetime.now()
        predictions = []
        
        # Análisis de las próximas 48 horas
        for hour_offset in range(48):
            future_time = now + timedelta(hours=hour_offset)
            # Convert hour/minute to bucket (0-47, 30-min buckets)
            bucket = (future_time.hour * 2 + (1 if future_time.minute >= 30 else 0)) % 48
            probability = self.calculate_hour_probability(
                bucket,
                future_time.weekday(),
                patterns,
                hour_offset
            )

            if probability > 0.25:  # Solo mostrar probabilidades significativas
                predictions.append({
                    'time': future_time.strftime('%H:%M'),
                    'datetime': future_time.isoformat(),
                    'probability': round(probability, 3),
                    'confidence': self.get_confidence_level(probability, patterns),
                    'day': future_time.strftime('%A'),
                    'hours_from_now': hour_offset,
                    'reasoning': self.get_prediction_reasoning(bucket, future_time.weekday(), patterns)
                })
        
        return sorted(predictions, key=lambda x: x['probability'], reverse=True)
    
    def calculate_hour_probability(self, bucket, day_of_week, patterns, hour_offset):
        """Cálculo avanzado de probabilidad"""
        # Base score por bucket favorito
        hour_score = 0
        for fav_bucket, score in patterns['favorite_buckets'][:5]:  # Top 5 buckets
            if fav_bucket == bucket:
                hour_score = min(score / patterns['total_sessions'], 0.8)
                break

        # Base score por día favorito
        day_score = 0
        for fav_day, score in patterns['favorite_days'][:3]:  # Top 3 días
            if fav_day == day_of_week:
                day_score = min(score / patterns['total_sessions'], 0.7)
                break

        # Boost por prime buckets
        prime_boost = 0
        for prime in patterns['prime_buckets'][:3]:  # Top 3 prime buckets
            if prime['bucket'] == bucket:
                prime_boost = min(prime['intensity'] / 100, 0.3)
                break

        # Check for day×hour interaction (both favorable = bonus)
        interaction_boost = 0
        for fav_bucket, hscore in patterns.get('favorite_buckets', [])[:5]:
            for fav_day, dscore in patterns.get('favorite_days', [])[:3]:
                if bucket == fav_bucket and day_of_week == fav_day:
                    interaction_boost = 0.2  # 20% bonus for matching both
                    break

        # Factor de tiempo desde última sesión
        time_factor = self.calculate_time_factor(patterns, hour_offset)

        # Factor de consistencia
        consistency_factor = patterns['consistency_score']

        # Combinar todos los factores con interacción
        base_probability = (hour_score * 0.4 + day_score * 0.3 + prime_boost * 0.2 + interaction_boost * 0.1)
        adjusted_probability = base_probability * time_factor * (0.5 + 0.5 * consistency_factor)

        # Aplicar strength del patrón
        final_probability = adjusted_probability * patterns['patterns_strength']

        return min(final_probability, 0.95)  # Cap máximo
    
    def calculate_time_factor(self, patterns, hour_offset):
        """Factor basado en tiempo desde última sesión con decaimiento exponencial"""
        if patterns['last_session'] == 0:
            return 0.5

        hours_since_last = (datetime.now().timestamp() - patterns['last_session']) / 3600
        total_hours_ahead = hours_since_last + hour_offset

        # Probabilidad aumenta conforme se acerca al gap promedio
        avg_gap = patterns['average_gap_hours']

        # Exponential decay: probability peaks at avg_gap, decays exponentially before and after
        decay_rate = 0.1  # controls how fast probability drops off
        ideal_window = avg_gap  # hours

        # Distance from ideal gap
        distance = abs(total_hours_ahead - ideal_window)

        # Exponential decay from ideal
        time_factor = max(0.1, math.exp(-decay_rate * distance))
        return min(time_factor, 1.0)
    
    def get_confidence_level(self, probability, patterns):
        """Determina el nivel de confianza textual"""
        sessions_factor = min(patterns['total_sessions'] / 15, 1.0)
        consistency_factor = patterns['consistency_score']
        
        combined_confidence = (probability + sessions_factor + consistency_factor) / 3
        
        if combined_confidence > 0.75:
            return "High"
        elif combined_confidence > 0.5:
            return "Medium"
        else:
            return "Low"
    
    def get_prediction_reasoning(self, bucket, day_of_week, patterns):
        """Genera explicación de la predicción"""
        reasons = []

        # Verificar si es bucket favorito
        bucket_time = f"{(bucket // 2):02d}:{(bucket % 2) * 30:02d}"
        for fav_bucket, score in patterns['favorite_buckets'][:3]:
            if fav_bucket == bucket:
                reasons.append(f"Favorite playing time ({bucket_time}, {int(score)} sessions)")
                break

        # Verificar si es día favorito
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        for fav_day, score in patterns['favorite_days'][:2]:
            if fav_day == day_of_week:
                reasons.append(f"Active on {day_names[day_of_week]}s")
                break

        # Verificar prime buckets
        for prime in patterns['prime_buckets'][:2]:
            if prime['bucket'] == bucket:
                reasons.append(f"Prime bucket {bucket_time} (avg {int(prime['avg_duration'])}m sessions)")
                break

        if not reasons:
            reasons.append("Based on general patterns")

        return "; ".join(reasons)
    
    def get_user_summary(self, user_id):
        """Resumen completo del jugador"""
        patterns = self.get_user_patterns(user_id)
        if not patterns:
            return None

        # Convert bucket number to time string
        bucket_to_time = lambda b: f"{(b // 2):02d}:{(b % 2) * 30:02d}"
        fav_buckets = [bucket_to_time(h) for h, _ in patterns.get('favorite_buckets', [])[:3]]

        # Días favoritos
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        fav_days = [day_names[d] for d, _ in patterns['favorite_days'][:3]]

        return {
            'total_sessions': patterns['total_sessions'],
            'total_playtime_hours': round(patterns['total_playtime'] / 60, 1),
            'avg_session_duration': round(patterns['average_duration'], 1),
            'avg_gap_between_sessions': round(patterns['average_gap_hours'], 1),
            'favorite_buckets': fav_buckets,
            'favorite_days': fav_days,
            'consistency': patterns['consistency_score'],
            'patterns_strength': patterns['patterns_strength'],
            'predictability': self.get_confidence_level(patterns['patterns_strength'], patterns)
        }

def main():
    """Función principal para CLI"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python simple_predictor.py <user_id> [summary]",
            "example": "python simple_predictor.py 1ed366a3-5779-612d-b6a0-ef2e8e1155b5"
        }))
        sys.exit(1)
    
    user_id = sys.argv[1]
    show_summary = len(sys.argv) > 2 and sys.argv[2] == 'summary'
    
    predictor = LocalSessionPredictor()
    
    # Verificar database
    db_ok, db_msg = predictor.check_database()
    if not db_ok:
        print(json.dumps({
            "error": db_msg,
            "user_id": user_id,
            "predictions": []
        }))
        sys.exit(1)
    
    try:
        if show_summary:
            # Mostrar resumen del jugador
            summary = predictor.get_user_summary(user_id)
            if summary:
                print(json.dumps({
                    "user_id": user_id,
                    "summary": summary,
                    "database_status": db_msg
                }, indent=2))
            else:
                print(json.dumps({
                    "error": f"Not enough data for user {user_id}",
                    "minimum_sessions": predictor.min_sessions
                }))
        else:
            # Mostrar predicciones
            predictions = predictor.predict_next_session(user_id)
            if predictions:
                print(json.dumps({
                    "user_id": user_id,
                    "predictions": predictions[:8],  # Top 8 predicciones
                    "generated_at": datetime.now().isoformat(),
                    "database_status": db_msg
                }))
            else:
                print(json.dumps({
                    "user_id": user_id,
                    "predictions": [],
                    "message": f"Not enough data (need {predictor.min_sessions}+ sessions)",
                    "database_status": db_msg
                }))
    
    except Exception as e:
        print(json.dumps({
            "error": f"Prediction failed: {str(e)}",
            "user_id": user_id,
            "predictions": []
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
