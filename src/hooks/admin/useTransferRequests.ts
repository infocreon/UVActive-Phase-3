import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TransferRequest } from "@/lib/types";

// Admin can only ever REQUEST a transfer — the receiving branch has to
// accept or decline it (Branch Portal → Transfer Requests). There is
// deliberately no "force assign" mutation wired up in the UI anymore;
// the backend override still exists (MembersService.adminAssign) but
// isn't exposed here, per spec: "admin can send a transfer request to
// the branch portal, not completely assign to the branch."
export function useAdminCreateTransferRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, toGymId }: { memberId: string; toGymId: string }) =>
      (await api.post<TransferRequest>("/admin/transfer-requests", { memberId, toGymId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "members"] }),
  });
}
