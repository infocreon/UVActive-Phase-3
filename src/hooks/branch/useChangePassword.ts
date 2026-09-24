import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Authenticated "change my own password" — distinct from the logged-out
// forgot-password/OTP flow already on the login screen. Backed by
// POST /auth/staff/change-password (requires current password, revokes
// all other active sessions on success, audit-logged).
export function useChangePassword() {
  return useMutation({
    mutationFn: async (dto: ChangePasswordInput) =>
      (await api.post("/auth/staff/change-password", dto)).data,
  });
}
