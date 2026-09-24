import { useState, useCallback, useRef, useEffect } from 'react';

export type WorkoutStatus = 'idle' | 'active' | 'paused' | 'completed';

interface WorkoutMetrics {
  duration: number; // in seconds
  calories: number;
  uvPoints: number;
  avgHeartRate: number;
  maxHeartRate: number;
  intensity: number; // percentage
}

interface WorkoutSession {
  status: WorkoutStatus;
  metrics: WorkoutMetrics;
  heartRateHistory: number[];
}

const UV_POINTS_PER_MINUTE_BASE = 5; // Base UV points per minute
export interface UserMetrics {
  age: number;
  weight: number;
  height: number;
  gender: 'male' | 'female' | 'other';
}

const DEFAULT_METRICS: UserMetrics = {
  age: 30,
  weight: 70,
  height: 170,
  gender: 'other',
};

function calculateIntensity(heartRate: number, maxHR: number = 190): number {
  return Math.min(100, Math.round((heartRate / maxHR) * 100));
}

// Calories ≈ (HR × 0.6309 + weight × 0.1988 + age × 0.2017 − 55.0969) × time / 4.184
// Gender-adjusted: male uses formula as-is, female multiplied by 0.9 (lower avg metabolic rate)
function calculateCalories(
  heartRate: number,
  durationMinutes: number,
  metrics: UserMetrics
): number {
  if (durationMinutes <= 0 || heartRate <= 0) return 0;
  const { weight, age, gender } = metrics;
  const raw = (heartRate * 0.6309 + weight * 0.1988 + age * 0.2017 - 55.0969) * durationMinutes / 4.184;
  const genderFactor = gender === 'female' ? 0.9 : 1.0;
  return Math.max(0, Math.round(raw * genderFactor));
}

function calculateUVPoints(intensity: number, durationMinutes: number): number {
  const intensityMultiplier = intensity / 50;
  return Math.round(UV_POINTS_PER_MINUTE_BASE * durationMinutes * intensityMultiplier);
}

export function useWorkoutSession(currentHeartRate: number | null, userMetrics?: UserMetrics) {
  const metrics = userMetrics ?? DEFAULT_METRICS;

  const [session, setSession] = useState<WorkoutSession>({
    status: 'idle',
    metrics: {
      duration: 0,
      calories: 0,
      uvPoints: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      intensity: 0,
    },
    heartRateHistory: [],
  });

  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);

  const updateMetrics = useCallback(() => {
    setSession(prev => {
      if (prev.status !== 'active') return prev;

      const now = Date.now();
      const duration = Math.floor((now - startTimeRef.current - pausedDurationRef.current) / 1000);
      const durationMinutes = duration / 60;

      const newHistory = currentHeartRate 
        ? [...prev.heartRateHistory, currentHeartRate]
        : prev.heartRateHistory;

      const avgHeartRate = newHistory.length > 0
        ? Math.round(newHistory.reduce((a, b) => a + b, 0) / newHistory.length)
        : 0;

      const maxHeartRate = newHistory.length > 0
        ? Math.max(...newHistory)
        : 0;

      const intensity = currentHeartRate ? calculateIntensity(currentHeartRate) : prev.metrics.intensity;
      const calories = calculateCalories(avgHeartRate || 100, durationMinutes, metrics);
      const uvPoints = calculateUVPoints(intensity, durationMinutes);

      return {
        ...prev,
        heartRateHistory: newHistory,
        metrics: {
          duration,
          calories,
          uvPoints,
          avgHeartRate,
          maxHeartRate,
          intensity,
        },
      };
    });
  }, [currentHeartRate, metrics]);

  const startWorkout = useCallback(() => {
    startTimeRef.current = Date.now();
    pausedDurationRef.current = 0;
    
    setSession({
      status: 'active',
      metrics: {
        duration: 0,
        calories: 0,
        uvPoints: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        intensity: 0,
      },
      heartRateHistory: [],
    });

    intervalRef.current = window.setInterval(updateMetrics, 1000);
  }, [updateMetrics]);

  const pauseWorkout = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSession(prev => ({ ...prev, status: 'paused' }));
  }, []);

  const resumeWorkout = useCallback(() => {
    setSession(prev => ({ ...prev, status: 'active' }));
    intervalRef.current = window.setInterval(updateMetrics, 1000);
  }, [updateMetrics]);

  const endWorkout = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSession(prev => ({ ...prev, status: 'completed' }));
  }, []);

  const resetWorkout = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSession({
      status: 'idle',
      metrics: {
        duration: 0,
        calories: 0,
        uvPoints: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        intensity: 0,
      },
      heartRateHistory: [],
    });
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    session,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    endWorkout,
    resetWorkout,
  };
}
