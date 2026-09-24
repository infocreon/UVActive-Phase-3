import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth, ApiError } from "@/lib/auth-context";

export default function AdminSettings() {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const valid = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1"}/auth/admin/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("uva_admin_access_token")}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new ApiError(json.error?.code || "UNKNOWN_ERROR", json.error?.message || "Could not update password.", res.status);
      }
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update password. Check your current password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-xl mx-auto">
        <h1 className="font-heading text-2xl font-bold mb-6">Settings</h1>
        <p className="text-muted-foreground text-sm mb-6">Manage your own account. Email and role are set by Admin and cannot be changed here.</p>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4 mb-6">
          <div>
            <p className="text-sm font-medium">{admin?.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{admin?.email}</p>
          </div>
          <div>
            <Label>Role</Label>
            <p className="text-sm">{admin?.role === "super_admin" ? "Super Admin" : "Support"}</p>
          </div>
        </div>

        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold">Change Password</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Update the password used to log in to the Admin Panel.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password-settings">New password</Label>
            <PasswordInput
              id="new-password-settings"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {tooShort && <p className="text-xs text-destructive">Password must be at least 8 characters.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password-settings">Confirm new password</Label>
            <PasswordInput
              id="confirm-password-settings"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
          </div>
          <Button type="submit" className="btn-cerise" disabled={!valid || saving}>
            {saving ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </AdminLayout>
  );
}
