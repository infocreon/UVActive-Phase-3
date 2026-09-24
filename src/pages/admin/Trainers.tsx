import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { GymCredentialsDialog, GymCredentials } from "@/components/admin/GymCredentialsDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import {
  useTrainers, useSuspendTrainer, useActivateTrainer, useDeleteTrainer, useResetTrainerPassword,
} from "@/hooks/admin/useTrainers";
import { useGyms } from "@/hooks/admin/useGyms";
import { ApiError } from "@/lib/auth-context";
import { Trainer } from "@/lib/types";

export default function Trainers() {
  const { data: trainers, isLoading } = useTrainers();
  const { data: gyms } = useGyms();
  const suspend = useSuspendTrainer();
  const activate = useActivateTrainer();
  const deleteTrainer = useDeleteTrainer();
  const resetPassword = useResetTrainerPassword();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [gymFilter, setGymFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<Trainer | null>(null);
  const [resetTarget, setResetTarget] = useState<Trainer | null>(null);
  const [credentials, setCredentials] = useState<GymCredentials | null>(null);

  const filtered = useMemo(() => {
    if (!trainers) return [];
    const q = search.trim().toLowerCase();
    return trainers.filter((t) => {
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
      const matchesGym = gymFilter === "all" || t.gymId === gymFilter;
      return matchesSearch && matchesGym;
    });
  }, [trainers, search, gymFilter]);

  const toggleStatus = (id: string, name: string, status: string) => {
    const mutation = status === "active" ? suspend : activate;
    mutation.mutate(id, {
      onSuccess: () => toast.success(`${name} ${status === "active" ? "suspended" : "activated"}.`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Action failed."),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTrainer.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.name} removed.`);
        setDeleteTarget(null);
      },
      onError: (err) => {
        // Backend blocks deletion while upcoming sessions are still assigned — surface that message.
        toast.error(err instanceof ApiError ? err.message : "Failed to remove trainer.");
        setDeleteTarget(null);
      },
    });
  };

  const handleResetPassword = () => {
    if (!resetTarget) return;
    resetPassword.mutate(resetTarget.id, {
      onSuccess: (result) => {
        setResetTarget(null);
        setCredentials({ managerEmail: result.email, temporaryPassword: result.temporaryPassword });
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Failed to reset password.");
        setResetTarget(null);
      },
    });
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Trainers</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Actual trainers only — branch managers are shown on the Gyms screen, not here. Click a trainer for details.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search trainers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={gymFilter} onValueChange={setGymFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filter by gym" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gyms</SelectItem>
            {gyms?.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trainer</TableHead>
              <TableHead>Gym</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No trainers found.
                </TableCell>
              </TableRow>
            )}

            {filtered.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/admin/trainers/${t.id}`)}>
                <TableCell>
                  <p className="font-medium hover:text-primary">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.email}</p>
                </TableCell>
                <TableCell>{t.gym?.name || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {t.status === "active" ? (
                        <DropdownMenuItem onClick={() => toggleStatus(t.id, t.name, t.status)}>Suspend</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => toggleStatus(t.id, t.name, t.status)}>Activate</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setResetTarget(t)}>Reset password</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(t)}>
                        Delete trainer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This is a soft delete — past sessions they ran keep their history, they just lose access and drop off the active roster. Blocked while they still have upcoming sessions on the books; reassign or cancel those first."
        confirmLabel="Delete Trainer"
        destructive
        loading={deleteTrainer.isPending}
        onConfirm={handleDelete}
      />

      <ConfirmActionDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={`Reset ${resetTarget?.name}'s password?`}
        description="A new temporary password is generated, emailed to them, and shown here once. Their current password and any active sessions stop working immediately."
        confirmLabel="Reset Password"
        loading={resetPassword.isPending}
        onConfirm={handleResetPassword}
      />

      <GymCredentialsDialog
        open={!!credentials}
        onOpenChange={(open) => !open && setCredentials(null)}
        credentials={credentials}
        title="Password reset"
        emailLabel="Trainer login email"
      />
    </AdminLayout>
  );
}
