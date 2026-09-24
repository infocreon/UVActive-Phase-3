import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { useMember, useAdminReleaseMember, useAdminResetMemberPin, useAnonymizeMember, useDeleteMember } from "@/hooks/admin/useMembers";
import { useAdminCreateTransferRequest } from "@/hooks/admin/useTransferRequests";
import { useGyms } from "@/hooks/admin/useGyms";
import { useAuth, ApiError } from "@/lib/auth-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Send, KeyRound, ShieldAlert, Trash2 } from "lucide-react";

export function MemberDetailSheet({ memberId, onOpenChange }: { memberId: string | null; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { data: member, isLoading } = useMember(memberId ?? undefined);
  const { data: gyms } = useGyms();
  const { isSuperAdmin } = useAuth();
  const requestTransfer = useAdminCreateTransferRequest();
  const releaseMember = useAdminReleaseMember();
  const resetPin = useAdminResetMemberPin();
  const anonymize = useAnonymizeMember();
  const deleteMember = useDeleteMember();

  const [assignGymId, setAssignGymId] = useState<string>("");
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);

  const handleRequestTransfer = () => {
    if (!memberId || !assignGymId) return;
    requestTransfer.mutate(
      { memberId, toGymId: assignGymId },
      {
        onSuccess: () => {
          toast.success("Transfer request sent. The branch needs to accept it before the member joins.");
          setAssignGymId("");
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to send transfer request."),
      },
    );
  };

  const handleRelease = () => {
    if (!memberId) return;
    releaseMember.mutate(
      { id: memberId },
      {
        onSuccess: () => {
          toast.success("Member released from their gym.");
          setConfirmRelease(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to release member."),
      },
    );
  };

  const handleResetPin = () => {
    if (!memberId) return;
    resetPin.mutate(memberId, {
      onSuccess: (res) => {
        toast.success("PIN reset.");
        if (res?.plainPin) setNewPin(res.plainPin);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to reset PIN."),
    });
  };

  const handleDelete = () => {
    if (!memberId) return;
    deleteMember.mutate(memberId, {
      onSuccess: () => {
        toast.success("Member deleted.");
        setConfirmDelete(false);
        onOpenChange(false);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to delete member."),
    });
  };

  const handleAnonymize = (password?: string) => {
    if (!memberId || !password) return;
    anonymize.mutate(
      { id: memberId, adminPassword: password },
      {
        onSuccess: () => {
          toast.success("Member data anonymized.");
          setConfirmAnonymize(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to anonymize member."),
      },
    );
  };

  return (
    <Sheet open={!!memberId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isLoading ? "Loading..." : member?.name}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-3 mt-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {member && (
          <div className="mt-6 space-y-6">
            {/* Profile */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Member Code</p>
                <p className="font-medium">{member.memberCode}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <StatusBadge status={member.status} />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Phone</p>
                <p>{member.phone || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Email</p>
                <p>{member.email || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Age</p>
                <p>{member.ageYears ? `${member.ageYears} yrs` : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Sex</p>
                <p className="capitalize">{member.sex || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Height</p>
                <p>{member.heightCm ? `${member.heightCm} cm` : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Weight</p>
                <p>{member.weightKg ? `${member.weightKg} kg` : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Resting HR</p>
                <p>{member.restingHr ? `${member.restingHr} bpm` : "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Current Gym</p>
                <p className="font-medium">{member.currentGym?.name || "Unassigned"}</p>
              </div>
            </div>

            {/* Override actions */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gym Placement</p>
              <p className="text-xs text-muted-foreground">
                This sends a transfer request to the branch — the branch manager has to accept it before the
                member actually joins. It doesn't assign them outright.
              </p>
              <div className="flex gap-2">
                <Select value={assignGymId} onValueChange={setAssignGymId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Send transfer request to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gyms
                      ?.filter((g) => g.status === "active" && g.id !== member.currentGymId)
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="btn-cerise gap-1.5" disabled={!assignGymId || requestTransfer.isPending} onClick={handleRequestTransfer}>
                  <Send className="h-3.5 w-3.5" /> Send Request
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!member.currentGymId} onClick={() => setConfirmRelease(true)}>
                  Release from gym
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleResetPin} disabled={resetPin.isPending}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset PIN
                </Button>
                {isSuperAdmin && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setConfirmAnonymize(true)}>
                    <ShieldAlert className="h-3.5 w-3.5" /> Anonymize
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Gym history */}
            <div>
              <p className="text-sm font-semibold mb-2">Gym History</p>
              <div className="space-y-2">
                {member.gymHistory?.length ? (
                  member.gymHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{h.gym?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.joinedAt).toLocaleDateString()} — {h.leftAt ? new Date(h.leftAt).toLocaleDateString() : "present"}
                        </p>
                      </div>
                      {h.releasedByType && (
                        <span className="text-xs text-muted-foreground capitalize">{h.releasedByType.replace(/_/g, " ")}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No gym history yet.</p>
                )}
              </div>
            </div>

            {/* Session history */}
            <div>
              <p className="text-sm font-semibold mb-2">Session History</p>
              <div className="space-y-2">
                {member.sessionMembers?.length ? (
                  member.sessionMembers.map((sm) => (
                    <button
                      key={sm.id}
                      className="w-full flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 text-left hover:text-primary"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/admin/sessions/${sm.sessionId}`);
                      }}
                    >
                      <div>
                        <p className="font-medium">{sm.session?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sm.session?.startedAt ? new Date(sm.session.startedAt).toLocaleDateString() : "unscheduled"}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p>Avg HR: {sm.avgHr ?? "—"} · Peak HR: {sm.maxHr ?? "—"} · Cal: {sm.calories ?? "—"}</p>
                        <p>
                          Max %HR: {sm.maxPctMhr != null ? `${Math.round(sm.maxPctMhr)}%` : "0%"} · Sweat: {sm.sweatPoints ?? "—"} · Recovery: {sm.recoveryPoints ?? "0"}{sm.recoveryGrade ? ` (${sm.recoveryGrade})` : ""} · EPOC: {sm.epocCalories != null ? `${Math.round(sm.epocCalories)} kcal` : "—"}{sm.consistencyPct != null ? ` · Consistency: ${Math.round(sm.consistencyPct)}%` : ""}
                        </p>
                        <p className="text-muted-foreground">Score: {sm.score ?? "—"}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <ConfirmActionDialog
          open={confirmRelease}
          onOpenChange={setConfirmRelease}
          title="Release this member?"
          description="This releases the member from their current gym without requiring their consent — a deliberate admin-level override, logged as such."
          confirmLabel="Release Member"
          destructive
          loading={releaseMember.isPending}
          onConfirm={handleRelease}
        />

        <ConfirmActionDialog
          open={confirmAnonymize}
          onOpenChange={setConfirmAnonymize}
          title="Anonymize this member?"
          description="This permanently scrubs personal info (name, phone, email, photo, DOB) and disables login. Member code and session/gym history rows are retained. This cannot be undone."
          confirmLabel="Anonymize Member"
          destructive
          requirePassword
          loading={anonymize.isPending}
          onConfirm={handleAnonymize}
        />

        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this member?"
          description="This permanently removes the member and all their session/gym history rows — a true hard delete, unlike Anonymize. Use this only for mistaken or test records. This cannot be undone."
          confirmLabel="Delete Member"
          destructive
          loading={deleteMember.isPending}
          onConfirm={handleDelete}
        />

        {/* New PIN reveal — shown once, same posture as member creation */}
        <Dialog open={!!newPin} onOpenChange={(o) => !o && setNewPin(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">New PIN generated</DialogTitle>
            </DialogHeader>
            <div className="bg-muted rounded-lg p-4 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Login PIN</p>
              <code className="text-lg font-mono tracking-widest">{newPin}</code>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Give this to the member — it also went out by SMS if they have a phone on file. It won't be shown here again.
            </p>
            <DialogFooter>
              <Button className="w-full btn-cerise" onClick={() => setNewPin(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
