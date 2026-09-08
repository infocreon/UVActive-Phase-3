import { api } from './api';

export interface MemberSessionSummary {
  id: string; // SessionMember row id
  sessionId: string;
  enrolledAt: string;
  attendance: 'enrolled' | 'attended' | 'no_show' | 'cancelled';
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  zoneMinutes: Record<string, number> | null;
  score: number | null;
  // Rich post-workout fields — computed once by the Trainer App's
  // formula engine at session-end and synced to the cloud (see
  // sessions.service.ts's end()); read here rather than recomputed
  // client-side so the Member App always agrees with the Trainer App /
  // Branch Portal / Admin Panel on the same session's numbers.
  finalRank: number | null;
  sweatPoints: number | null;
  recoveryPoints: number | null;
  recoveryGrade: string | null;
  epocCalories: number | null;
  epocHours: number | null;
  avgPctMhr: number | null;
  maxPctMhr: number | null;
  // Interval/target-zone consistency % — see sessions.service.ts's
  // end() and the SessionMember.consistencyPct column comment.
  consistencyPct: number | null;
  session: {
    id: string;
    name: string;
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    startedAt: string | null;
    endedAt: string | null;
    scheduledAt: string | null;
    gym?: { name: string } | null;
    trainer?: { name: string } | null;
  };
}

export interface SessionTicks {
  ticks: { ts: number; bpm: number; zone?: number; pctMhr?: number }[];
}

// GET member/sessions/available -> bookable sessions at the member's own
// gym. Capacity is always the gym's registered sensor-slot count (set
// server-side, never trainer-typed) — see AvailableSession.capacity.
export interface AvailableSession {
  id: string;
  name: string;
  status: 'scheduled';
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  capacity: number;
  trainer?: { id: string; name: string } | null;
  _count?: { members: number };
  isBooked: boolean;
  spotsOpen: number;
}

// GET member/sessions -> full history (this session's own result row).
// The Workout screen's calendar buckets these by the session's date.
function normalize(row: any): MemberSessionSummary {
  return { ...row, sessionId: row.sessionId ?? row.session?.id };
}

export const sessionsApi = {
  mine: async () => (await api.get<any[]>('/member/sessions')).map(normalize),
  get: async (sessionId: string) => normalize(await api.get<any>(`/member/sessions/${sessionId}`)),
  ticks: (sessionId: string) => api.get<SessionTicks>(`/member/sessions/${sessionId}/ticks`),

  // ── Book-a-Session ──────────────────────────────────────────────
  available: () => api.get<AvailableSession[]>('/member/sessions/available'),
  book: (sessionId: string) => api.post(`/member/sessions/${sessionId}/book`),
  cancelBooking: (sessionId: string) => api.delete(`/member/sessions/${sessionId}/booking`),
};
