import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Member, PageMeta, Sex } from "@/lib/types";

const KEY = ["admin", "members"];

export function useMembers(params: { skip?: number; take?: number; gymId?: string; sortBy?: string; sortOrder?: "asc" | "desc" } = {}) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: async () => {
      const { data, meta } = await api.get<Member[]>("/admin/members", params);
      return { data, meta: meta as unknown as PageMeta };
    },
  });
}

export interface CreateAdminMemberInput {
  name: string;
  phone: string;
  email: string;
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  restingHr: number;
}

export function useCreateAdminMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateAdminMemberInput) => (await api.post<Member>("/admin/members", dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMemberSearch(code: string) {
  return useQuery({
    queryKey: [...KEY, "search", code],
    queryFn: async () => (await api.get<Member[]>("/admin/members/search", { code })).data,
    enabled: code.length >= 3,
  });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<Member>(`/admin/members/${id}`)).data,
    enabled: !!id,
  });
}

export function useAdminAssignMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, gymId, reason }: { id: string; gymId: string; reason?: string }) =>
      (await api.post<Member>(`/admin/members/${id}/assign`, { gymId, reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAdminReleaseMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (await api.post<Member>(`/admin/members/${id}/release`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAdminResetMemberPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<{ ok: boolean; plainPin: string }>(`/admin/members/${id}/reset-pin`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// True hard delete — super_admin only. Distinct from anonymize below
// (which keeps the row/history for data-integrity reasons). See
// MembersService.delete on the backend.
export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/members/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Super-admin-only, one-way. Requires the acting admin's own password
// (spec §9) — the confirm dialog collects it and passes it straight through.
export function useAnonymizeMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminPassword }: { id: string; adminPassword: string }) =>
      (await api.post(`/admin/members/${id}/anonymize`, { adminPassword })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
