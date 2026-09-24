import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { GymFormDialog, GymFormValues } from "@/components/admin/GymFormDialog";
import { EditGymManagerDialog } from "@/components/admin/EditGymManagerDialog";
import { GymCredentialsDialog, GymCredentials } from "@/components/admin/GymCredentialsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreVertical, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useGyms,
  useCreateGym,
  useUpdateGym,
  useSuspendGym,
  useActivateGym,
  useResetGymManagerPassword,
} from "@/hooks/admin/useGyms";
import { Gym } from "@/lib/types";
import { ApiError } from "@/lib/auth-context";

export default function Gyms() {
  const { data: gyms, isLoading } = useGyms();
  const createGym = useCreateGym();
  const updateGym = useUpdateGym();
  const suspendGym = useSuspendGym();
  const activateGym = useActivateGym();
  const resetManagerPassword = useResetGymManagerPassword();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGym, setEditingGym] = useState<Gym | null>(null);
  const [managerTarget, setManagerTarget] = useState<Gym | null>(null);
  const [credentials, setCredentials] = useState<GymCredentials | null>(null);

  const filtered = useMemo(() => {
    if (!gyms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return gyms;
    return gyms.filter((g) => g.name.toLowerCase().includes(q) || g.address?.toLowerCase().includes(q));
  }, [gyms, search]);

  const handleSubmit = (values: GymFormValues) => {
    // Defense in depth on top of the backend's EmptyToUndefined
    // handling: send `undefined` rather than `""` for optional
    // contact fields left blank, so a request from an older/other
    // client that skips the backend normalization still behaves.
    const ownerContact = values.ownerContact.trim() === "" ? undefined : values.ownerContact;
    const contactEmail = values.contactEmail.trim() === "" ? undefined : values.contactEmail;

    if (editingGym) {
      // The manager account fields (name/email/phone) only exist on the
      // "Create Gym" form — GymFormDialog hides those inputs when
      // editing, but `values` still carries them (as "" defaults).
      // UpdateGymDto on the backend doesn't accept those properties at
      // all, and the API rejects unknown properties instead of
      // ignoring them, so they must be stripped here before the
      // update request is sent, not just left out of the DTO's type.
      const { name, address, location, gymPhone, memberLimit } = values;
      updateGym.mutate(
        { id: editingGym.id, dto: { name, address, location, gymPhone, ownerContact, contactEmail, memberLimit } },
        {
          onSuccess: () => {
            toast.success("Gym updated.");
            setFormOpen(false);
            setEditingGym(null);
          },
          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong."),
        },
      );
      return;
    }
    createGym.mutate(
      { ...values, ownerContact, contactEmail },
      {
        onSuccess: ({ gym, manager }) => {
          setFormOpen(false);
          setCredentials({ gymName: gym.name, gymId: gym.id, managerEmail: manager.email, temporaryPassword: manager.temporaryPassword });
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong."),
      },
    );
  };

  const handleResetManagerPassword = (gym: Gym) => {
    resetManagerPassword.mutate(gym.id, {
      onSuccess: (data) => setCredentials({ gymName: gym.name, managerEmail: data.email, temporaryPassword: data.temporaryPassword }),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to reset the manager's password."),
    });
  };

  const handleSuspend = (gym: Gym) => {
    suspendGym.mutate(gym.id, {
      onSuccess: () => toast.success(`${gym.name} suspended.`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to suspend gym."),
    });
  };

  const handleActivate = (gym: Gym) => {
    activateGym.mutate(gym.id, {
      onSuccess: () => toast.success(`${gym.name} activated.`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to activate gym."),
    });
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Gyms</h1>
          <p className="text-muted-foreground text-sm mt-1">Create, suspend, and manage every branch on the platform.</p>
        </div>
        <Button
          className="btn-cerise gap-2"
          onClick={() => {
            setEditingGym(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Gym
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search gyms..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gym</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Trainers</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No gyms found.
                </TableCell>
              </TableRow>
            )}

            {filtered.map((gym) => (
              <TableRow key={gym.id}>
                <TableCell>
                  <button
                    className="font-medium hover:text-primary text-left"
                    onClick={() => {
                      setEditingGym(gym);
                      setFormOpen(true);
                    }}
                  >
                    {gym.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {[gym.address, gym.location].filter(Boolean).join(" · ") || "—"}
                    {gym.gymPhone ? ` · ${gym.gymPhone}` : ""}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={gym.status} />
                </TableCell>
                <TableCell>
                  {gym._count?.currentMembers ?? 0}
                  <span className="text-muted-foreground"> / {gym.memberLimit}</span>
                </TableCell>
                <TableCell>{gym._count?.trainers ?? 0}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(gym.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingGym(gym);
                          setFormOpen(true);
                        }}
                      >
                        Edit details
                      </DropdownMenuItem>
                      {gym.status === "active" && (
                        <DropdownMenuItem onClick={() => handleSuspend(gym)}>Suspend gym</DropdownMenuItem>
                      )}
                      {gym.status === "suspended" && (
                        <DropdownMenuItem onClick={() => handleActivate(gym)}>Activate gym</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleResetManagerPassword(gym)}>
                        Reset manager password
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setManagerTarget(gym)}>Edit manager details</DropdownMenuItem>
                      {/* No "Delete gym" action by design — gyms are only ever
                          suspended/reactivated from the portal (the backend
                          keeps a guarded soft-delete for data hygiene). */}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <GymFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        gym={editingGym}
        loading={createGym.isPending || updateGym.isPending}
        onSubmit={handleSubmit}
      />

      <GymCredentialsDialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)} credentials={credentials} />

      <EditGymManagerDialog gym={managerTarget} onOpenChange={(open) => !open && setManagerTarget(null)} />
    </AdminLayout>
  );
}
