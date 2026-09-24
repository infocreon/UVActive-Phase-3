import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AdminAccount, AdminRole } from "@/lib/types";

const KEY = ["admin", "admins"];

export function useAdmins() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<AdminAccount[]>("/admin/admins")).data,
  });
}

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { name: string; email: string; password: string; role?: AdminRole }) =>
      (await api.post<AdminAccount>("/admin/admins", dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReset2fa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/admins/${id}/reset-2fa`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
