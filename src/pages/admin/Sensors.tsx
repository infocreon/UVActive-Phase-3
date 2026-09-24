import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminSensors, useBulkCreateSensors, useDeleteSensor, AdminSensorRow } from "@/hooks/admin/useSensors";
import { useGyms } from "@/hooks/admin/useGyms";
import { ApiError } from "@/lib/api";

export default function Sensors() {
  const { data: sensors, isLoading } = useAdminSensors();
  const deleteSensor = useDeleteSensor();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminSensorRow | null>(null);

  const filtered = useMemo(() => {
    if (!sensors) return [];
    const q = search.trim().toLowerCase();
    if (!q) return sensors;
    return sensors.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.sensorId.toLowerCase().includes(q) ||
        s.gym?.name.toLowerCase().includes(q),
    );
  }, [sensors, search]);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Sensors</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every registered sensor strap across every gym. Admins can bulk-add sensors to any gym here — the same
            thing branch managers do from their own portal.
          </p>
        </div>
        <Button className="btn-cerise" onClick={() => setAddOpen(true)}>
          + Add Sensors
        </Button>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, ID, or gym..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sensor Name</TableHead>
              <TableHead>Sensor ID</TableHead>
              <TableHead>Gym</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Radio className="h-8 w-8 text-muted-foreground" />
                    No sensors registered yet — use “+ Add Sensors” to bulk-register straps for a gym.
                  </div>
                </TableCell>
              </TableRow>
            )}

            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{s.sensorId}</TableCell>
                <TableCell>{s.gym?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.note || "—"}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    title="Delete sensor"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BulkAddSensorsDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete sensor "${deleteTarget?.name ?? ""}" (${deleteTarget?.sensorId ?? ""})?`}
        description={
          deleteTarget?.gym?.name
            ? `This removes the strap from ${deleteTarget.gym.name} and lowers that gym's session capacity by one slot. This cannot be undone.`
            : "This removes the strap and lowers that gym's session capacity by one slot. This cannot be undone."
        }
        confirmLabel="Delete"
        destructive
        loading={deleteSensor.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSensor.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success("Sensor deleted.");
              setDeleteTarget(null);
            },
            onError: (err) => {
              toast.error(err instanceof ApiError ? err.message : "Could not delete sensor.");
              setDeleteTarget(null);
            },
          });
        }}
      />
    </AdminLayout>
  );
}

/**
 * Admin-side bulk registration, mirroring what a branch manager does in
 * their own Sensors tab: pick the gym, give the straps one shared name
 * (e.g. "HR Strap"), and paste their hardware IDs comma-separated
 * ("12345,12346, 12347"). One sensor row is created per ID; IDs the gym
 * already has are skipped and reported, never a partial failure.
 */
function BulkAddSensorsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: gyms } = useGyms();
  const bulkCreate = useBulkCreateSensors();
  const [gymId, setGymId] = useState("");
  const [name, setName] = useState("");
  const [sensorIds, setSensorIds] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setGymId("");
      setName("");
      setSensorIds("");
      setNote("");
    }
  }, [open]);

  // Preselect once the gym list lands so the admin doesn't have to
  // open the dropdown twice when there's only one gym.
  useEffect(() => {
    if (open && !gymId && gyms && gyms.length > 0) setGymId(gyms[0].id);
  }, [open, gymId, gyms]);

  const idPreview = useMemo(
    () =>
      [...new Set(sensorIds.split(",").map((id) => id.trim()).filter(Boolean))],
    [sensorIds],
  );

  const loading = bulkCreate.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gymId) {
      toast.error("Pick the gym these sensors belong to.");
      return;
    }
    bulkCreate.mutate(
      { gymId, dto: { name, sensorIds, note: note || undefined } },
      {
        onSuccess: (res) => {
          if (res.skippedCount > 0) {
            toast.success(`${res.createdCount} sensor(s) added to ${res.gymName}. Skipped ${res.skippedCount} already registered: ${res.skippedIds.join(", ")}`);
          } else {
            toast.success(`${res.createdCount} sensor(s) added to ${res.gymName}.`);
          }
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add sensors."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Sensors to Gym</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bs-gym">Gym</Label>
            <select
              id="bs-gym"
              required
              value={gymId}
              onChange={(e) => setGymId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {(gyms ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bs-name">Sensor name (shared by all)</Label>
            <Input
              id="bs-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Polar Verity Sense"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bs-ids">Sensor IDs (comma-separated)</Label>
            <Textarea
              id="bs-ids"
              required
              value={sensorIds}
              onChange={(e) => setSensorIds(e.target.value)}
              rows={3}
              placeholder="7683419E,9475T6785,178456I67"
            />
            <p className="text-xs text-muted-foreground">
              One sensor is created per ID. Duplicates and whitespace are handled automatically; IDs the gym already
              has are skipped, not failed.
            </p>
            {idPreview.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Will add {idPreview.length} sensor{':'}{" "}
                <span className="font-mono">{idPreview.slice(0, 12).join(", ")}{idPreview.length > 12 ? "…" : ""}</span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bs-note">Note (optional)</Label>
            <Textarea id="bs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} 
            placeholder="Add a note about these sensors...(eg: Chess strap)" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="btn-cerise" disabled={loading || idPreview.length === 0}>
              {loading ? "Adding..." : `Add ${idPreview.length || ""} Sensor${idPreview.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
