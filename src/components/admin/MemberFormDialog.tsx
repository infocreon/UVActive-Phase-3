import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sex } from "@/lib/types";
import { CreateAdminMemberInput } from "@/hooks/admin/useMembers";

interface MemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  onSubmit: (values: CreateAdminMemberInput) => void;
}

const EMPTY: CreateAdminMemberInput = {
  name: "", phone: "", email: "", sex: "male", ageYears: 0, heightCm: 0, weightKg: 0, restingHr: 0,
};

export function MemberFormDialog({ open, onOpenChange, loading, onSubmit }: MemberFormDialogProps) {
  const [values, setValues] = useState<CreateAdminMemberInput>(EMPTY);

  const handleOpenChange = (o: boolean) => {
    if (!o) setValues(EMPTY);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Member</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(values);
          }}
        >
          <p className="text-xs text-muted-foreground -mt-2">
            The member starts unassigned. Placing them at a gym is done from their profile — send a transfer
            request to the branch, which the branch then accepts.
          </p>

          <div className="space-y-2">
            <Label htmlFor="m-name">Full Name</Label>
            <Input id="m-name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-email">Email id</Label>
            <Input id="m-email" type="email" required value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-phone">Phone Number</Label>
            <Input id="m-phone" required value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="m-age">Age</Label>
              <Input
                id="m-age"
                type="number"
                min={1}
                max={120}
                required
                value={values.ageYears || ""}
                onChange={(e) => setValues({ ...values, ageYears: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-sex">Sex</Label>
              <Select value={values.sex} onValueChange={(v: Sex) => setValues({ ...values, sex: v })}>
                <SelectTrigger id="m-sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="m-height">Height (cm)</Label>
              <Input
                id="m-height"
                type="number"
                min={1}
                required
                value={values.heightCm || ""}
                onChange={(e) => setValues({ ...values, heightCm: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-weight">Weight (kg)</Label>
              <Input
                id="m-weight"
                type="number"
                min={1}
                required
                value={values.weightKg || ""}
                onChange={(e) => setValues({ ...values, weightKg: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-resting-hr">Resting HR (bpm)</Label>
            <Input
              id="m-resting-hr"
              type="number"
              min={1}
              required
              value={values.restingHr || ""}
              onChange={(e) => setValues({ ...values, restingHr: Number(e.target.value) })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="btn-cerise" disabled={loading}>
              {loading ? "Creating..." : "Create Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
