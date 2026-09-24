import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Gym } from "@/lib/types";

export interface GymFormValues {
  name: string;
  address: string;
  location: string;
  gymPhone: string;
  ownerContact: string;
  contactEmail: string;
  memberLimit: number;
  // Branch-manager login account, created together with the gym itself
  // — a gym with no one able to log in to it isn't usable. Only sent
  // (and only shown) when creating a brand-new gym; an existing gym's
  // manager account is managed from the row's "Reset manager password"
  // action instead, never re-typed here.
  managerName: string;
  managerEmail: string;
  managerPhone: string;
}

interface GymFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gym?: Gym | null;
  loading?: boolean;
  onSubmit: (values: GymFormValues) => void;
}

const EMPTY: GymFormValues = {
  name: "", address: "", location: "", gymPhone: "", ownerContact: "", contactEmail: "", memberLimit: 5,
  managerName: "", managerEmail: "", managerPhone: "",
};

export function GymFormDialog({ open, onOpenChange, gym, loading, onSubmit }: GymFormDialogProps) {
  const [values, setValues] = useState<GymFormValues>(EMPTY);

  useEffect(() => {
    if (gym) {
      setValues({
        ...EMPTY,
        name: gym.name,
        address: gym.address ?? "",
        location: gym.location ?? "",
        gymPhone: gym.gymPhone ?? "",
        ownerContact: gym.ownerContact ?? "",
        contactEmail: gym.contactEmail ?? "",
        memberLimit: gym.memberLimit,
      });
    } else {
      setValues(EMPTY);
    }
  }, [gym, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gym ? "Edit Gym" : "Create Gym"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(values);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="gym-name">Gym name</Label>
            <Input id="gym-name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-address">Address</Label>
            <Input id="gym-address" required value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-location">Location</Label>
            <Input
              id="gym-location"
              required
              placeholder="Area / city"
              value={values.location}
              onChange={(e) => setValues({ ...values, location: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-phone">Phone number of gym</Label>
            <Input
              id="gym-phone"
              required
              value={values.gymPhone}
              onChange={(e) => setValues({ ...values, gymPhone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-owner-contact">Owner contact (optional)</Label>
            <Input
              id="gym-owner-contact"
              value={values.ownerContact}
              onChange={(e) => setValues({ ...values, ownerContact: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-contact-email">Contact email (optional)</Label>
            <Input
              id="gym-contact-email"
              type="email"
              value={values.contactEmail}
              onChange={(e) => setValues({ ...values, contactEmail: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gym-limit">Members capacity</Label>
            <Input
              id="gym-limit"
              type="number"
              min={1}
              required
              value={values.memberLimit}
              onChange={(e) => setValues({ ...values, memberLimit: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to 5 — raise it if the branch will take more. Lowering it below the current member count won't
              evict anyone; it only blocks new registrations until the count drops below the new cap.
            </p>
          </div>

          {!gym && (
            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium">Branch manager login</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Creates the Branch Portal account for this gym. A temporary password is generated and shown once
                  on the next screen — there's no way to run a branch without someone able to log in to it.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-name">Manager name</Label>
                <Input
                  id="manager-name"
                  required
                  value={values.managerName}
                  onChange={(e) => setValues({ ...values, managerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-email">Manager email</Label>
                <Input
                  id="manager-email"
                  type="email"
                  required
                  value={values.managerEmail}
                  onChange={(e) => setValues({ ...values, managerEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-phone">Manager phone</Label>
                <Input
                  id="manager-phone"
                  required
                  value={values.managerPhone}
                  onChange={(e) => setValues({ ...values, managerPhone: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="btn-cerise" disabled={loading}>
              {loading ? "Saving..." : gym ? "Save Changes" : "Create Gym"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
