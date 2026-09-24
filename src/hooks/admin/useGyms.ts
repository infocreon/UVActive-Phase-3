import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Gym } from "@/lib/types";

const KEY = ["admin", "gyms"];

export function useGyms() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Gym[]>("/admin/gyms")).data,
  });
}

export function useGym(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<Gym>(`/admin/gyms/${id}`)).data,
    enabled: !!id,
  });
}

interface CreateGymInput {
  name: string;
  address: string;
  location: string;
  gymPhone: string;
  ownerContact?: string;
  contactEmail?: string;
  memberLimit: number;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
}

// Deliberately its OWN type, not Partial<CreateGymInput> — the update
// endpoint's UpdateGymDto has no managerName/managerEmail/managerPhone
// fields at all (the manager account is created once, alongside the
// gym, and changed afterwards only via "Reset manager password"). The
// backend runs forbidNonWhitelisted validation, so sending those keys
// on an update — even as "" — is rejected outright with "property
// managerName should not exist" instead of being silently dropped.
// Keeping this as a separate type means TypeScript itself stops
// anyone from passing manager fields into useUpdateGym by mistake.
export interface UpdateGymInput {
  name?: string;
  address?: string;
  location?: string;
  gymPhone?: string;
  ownerContact?: string;
  contactEmail?: string;
  memberLimit?: number;
}

export interface GymManager {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: "active" | "suspended";
  totpEnabled: boolean;
  createdAt: string;
}

export interface CreateGymResult {
  gym: Gym;
  manager: { id: string; name: string; email: string; temporaryPassword: string };
}

export function useCreateGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateGymInput) => (await api.post<CreateGymResult>("/admin/gyms", dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useGymManager(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id, "manager"],
    queryFn: async () => (await api.get<GymManager | null>(`/admin/gyms/${id}/manager`)).data,
    enabled: !!id,
  });
}

export interface UpdateGymManagerInput {
  name?: string;
  email?: string;
  phone?: string;
}

// Admin-only editing of the manager's OWN identity fields — distinct
// from useUpdateGym (the gym row) and useResetGymManagerPassword
// (credentials). Spec: only admin can change a manager's email/phone;
// the Branch Portal Settings screen deliberately can't reach this.
export function useUpdateGymManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateGymManagerInput }) =>
      (await api.patch<GymManager>(`/admin/gyms/${id}/manager`, dto)).data,
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: [...KEY, id, "manager"] }),
  });
}

export function useResetGymManagerPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ managerId: string; email: string; temporaryPassword: string }>(`/admin/gyms/${id}/manager/reset-password`)).data,
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: [...KEY, id, "manager"] }),
  });
}

export function useUpdateGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateGymInput }) =>
      (await api.patch<Gym>(`/admin/gyms/${id}`, dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSuspendGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Gym>(`/admin/gyms/${id}/suspend`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useActivateGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Gym>(`/admin/gyms/${id}/activate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
