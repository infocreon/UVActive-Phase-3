import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Trainer } from "@/lib/types";

const KEY = ["admin", "trainers"];

export function useTrainers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Trainer[]>("/admin/trainers")).data,
  });
}

export function useTrainer(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<Trainer>(`/admin/trainers/${id}`)).data,
    enabled: !!id,
  });
}

export function useSuspendTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Trainer>(`/admin/trainers/${id}/suspend`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useActivateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Trainer>(`/admin/trainers/${id}/activate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/trainers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface ResetTrainerPasswordResult {
  trainerId: string;
  email: string;
  temporaryPassword: string;
}

export function useResetTrainerPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<ResetTrainerPasswordResult>(`/admin/trainers/${id}/reset-password`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
