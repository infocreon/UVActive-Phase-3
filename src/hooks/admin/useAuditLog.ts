import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AuditLogEntry, GymOption, PageMeta } from "@/lib/types";

export function useAuditLog(
  params: { targetType?: string; actorId?: string; action?: string; gymId?: string; skip?: number; take?: number },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["admin", "audit-log", params],
    queryFn: async () => {
      const { data, meta } = await api.get<AuditLogEntry[]>("/admin/audit-log", params);
      return { data, meta: meta as unknown as PageMeta };
    },
    enabled: options?.enabled ?? true,
  });
}

// Branch filter dropdown options for the Audit Log page — reuse the
// gyms list endpoint (it's the same data the Gyms tab already loads).
export function useAuditGymOptions() {
  return useQuery({
    queryKey: ["admin", "audit-log", "gym-options"],
    queryFn: async () => (await api.get<GymOption[]>("/admin/gyms")).data,
    staleTime: 5 * 60 * 1000,
  });
}
