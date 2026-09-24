import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useGymManager, useUpdateGymManager } from "@/hooks/admin/useGyms";
import { Gym } from "@/lib/types";
import { ApiError } from "@/lib/auth-context";

interface EditGymManagerDialogProps {
  gym: Gym | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-only — the manager's name, email, and phone are otherwise
 * locked (spec: "not the email id of manager and phone number, cannot
 * get changed only by admin can do"). This is that one path, reached
 * from the Gyms screen. Password itself is a separate action (Reset
 * manager password) — this dialog never touches credentials.
 */
export function EditGymManagerDialog({ gym, onOpenChange }: EditGymManagerDialogProps) {
  const { data: manager, isLoading } = useGymManager(gym?.id);
  const updateManager = useUpdateGymManager();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (manager) {
      setName(manager.name);
      setEmail(manager.email);
      setPhone(manager.phone ?? "");
    }
  }, [manager]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym) return;
    updateManager.mutate(
      { id: gym.id, dto: { name, email, phone } },
      {
        onSuccess: () => {
          toast.success("Manager details updated.");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update manager details."),
      },
    );
  };

  return (
    <Dialog open={!!gym} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit manager details</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {!isLoading && !manager && (
          <p className="text-sm text-muted-foreground py-4">This gym has no primary manager account yet.</p>
        )}

        {!isLoading && manager && (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="mgr-name">Manager name</Label>
              <Input id="mgr-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr-email">Manager email</Label>
              <Input id="mgr-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                This is also their Branch Portal login — changing it changes what they sign in with.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr-phone">Manager phone</Label>
              <Input id="mgr-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="btn-cerise" disabled={updateManager.isPending}>
                {updateManager.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
