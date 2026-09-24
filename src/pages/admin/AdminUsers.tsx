import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAdmins, useCreateAdmin, useReset2fa } from "@/hooks/admin/useAdmins";
import { useAuth, ApiError } from "@/lib/auth-context";
import { AdminRole } from "@/lib/types";

export default function AdminUsers() {
  const { data: admins, isLoading } = useAdmins();
  const createAdmin = useCreateAdmin();
  const reset2fa = useReset2fa();
  const { admin: currentAdmin } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "support" as AdminRole });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createAdmin.mutate(form, {
      onSuccess: () => {
        toast.success("Admin account created.");
        setDialogOpen(false);
        setForm({ name: "", email: "", password: "", role: "support" });
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create admin."),
    });
  };

  const handleReset2fa = (id: string, name: string) => {
    reset2fa.mutate(id, {
      onSuccess: () => toast.success(`2FA reset for ${name}. They'll be prompted to set it up again at next login.`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to reset 2FA."),
    });
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Admin Users</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage who has root access to the platform.</p>
        </div>
        <Button className="btn-cerise gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New Admin
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>2FA</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {admins?.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </TableCell>
                <TableCell>
                  <Badge className={a.role === "super_admin" ? "bg-primary/15 text-primary border-transparent" : "bg-secondary text-secondary-foreground border-transparent"}>
                    {a.role === "super_admin" ? "Super Admin" : "Support"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {a.totpEnabled ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Enabled
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not set up yet</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.id === currentAdmin?.id || reset2fa.isPending}
                    onClick={() => handleReset2fa(a.id, a.name)}
                    title={a.id === currentAdmin?.id ? "You can't reset your own 2FA this way" : undefined}
                  >
                    Reset 2FA
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Admin Account</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="admin-name">Name</Label>
              <Input id="admin-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Temporary password</Label>
              <PasswordInput
                id="admin-password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                They'll be required to set up 2FA the first time they log in — there's no bypass.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AdminRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">Support — read-only + release/reassign/suspend</SelectItem>
                  <SelectItem value="super_admin">Super Admin — full control</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="btn-cerise" disabled={createAdmin.isPending}>
                {createAdmin.isPending ? "Creating..." : "Create Admin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
