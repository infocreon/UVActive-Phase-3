import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HrTick, PageMeta, Session } from "@/lib/types";

const KEY = ["admin", "sessions"];

export interface BackfillResult {
  processed: number;
  updated: number;
  zeroFilled: number;
  sessionsReRanked: number;
}

// Recomputes every calculation field (HR, calories, sweat/recovery
// points, EPOC, %MHR, rank) for all completed sessions, either from raw
// readings or as guaranteed zeros — POST /admin/sessions/backfill-results.
export function useBackfillResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<BackfillResult>("/admin/sessions/backfill-results")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Per-second BPM history (zone-colored) for one member within one
// session — powers the leaderboard -> member drill-down graph.
// Backed by GET /admin/sessions/:id/athlete/:memberId/ticks.
export function useSessionAthleteTicks(sessionId: string | undefined, memberId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, sessionId, "athlete", memberId, "ticks"],
    queryFn: async () =>
      (await api.get<{ ticks: HrTick[] }>(`/admin/sessions/${sessionId}/athlete/${memberId}/ticks`)).data,
    enabled: !!sessionId && !!memberId,
  });
}

// Recalculate button on a single member's drill-down screen — recomputes
// just that session's members from their stored sensor log and re-ranks
// its leaderboard. POST /admin/sessions/:id/recalculate.
export function useRecalculateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => (await api.post(`/admin/sessions/${sessionId}/recalculate`)).data,
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, sessionId] });
    },
  });
}

export function useSessions(params: { skip?: number; take?: number; gymId?: string } = {}) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: async () => {
      const { data, meta } = await api.get<Session[]>("/admin/sessions", params);
      return { data, meta: meta as unknown as PageMeta };
    },
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<Session>(`/admin/sessions/${id}`)).data,
    enabled: !!id,
  });
}
