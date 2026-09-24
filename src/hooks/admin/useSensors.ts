import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export interface AdminSensorRow {
  id: string;
  gymId: string;
  gym?: { id: string; name: string };
  name: string;
  sensorId: string;
  note?: string | null;
  createdAt: string;
}

export interface BulkCreateResult {
  gymId: string;
  gymName: string;
  createdCount: number;
  skippedCount: number;
  skippedIds: string[];
  created: { id: string; sensorId: string }[];
}

export function useAdminSensors() {
  return useQuery({
    queryKey: ["admin", "sensors"],
    queryFn: async () => (await api.get<AdminSensorRow[]>("/admin/sensors")).data,
  });
}

// Admin-side bulk registration — same effect as a branch manager using
// "Add Sensor" N times in their own portal, scoped to a gym the admin
// picks. One shared name + a comma-separated list of hardware IDs
// ("12345,12346") becomes one sensor per ID.
export function useBulkCreateSensors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gymId, dto }: { gymId: string; dto: { name: string; sensorIds: string; note?: string } }) =>
      (await api.post<BulkCreateResult>(`/admin/sensors/gyms/${gymId}/bulk`, dto)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "sensors"] });
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) console.error("[UVActive] Bulk sensor add failed:", err);
    },
  });
}

// Remove any sensor row, platform-wide — the admin-side mirror of the
// branch manager's own Sensors-tab delete. Note the sensor count is
// the session-capacity cap, so removing one lowers that gym's ceiling.
export function useDeleteSensor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<{ deleted: boolean }>(`/admin/sensors/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "sensors"] });
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) console.error("[UVActive] Sensor delete failed:", err);
    },
  });
}
