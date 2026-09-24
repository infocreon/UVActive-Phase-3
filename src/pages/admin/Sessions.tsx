import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calculator, Filter } from "lucide-react";
import { toast } from "sonner";
import { useSessions, useBackfillResults } from "@/hooks/admin/useSessions";
import { useGyms } from "@/hooks/admin/useGyms";
import { ApiError } from "@/lib/auth-context";

const PAGE_SIZE = 25;

export default function Sessions() {
  const [page, setPage] = useState(0);
  const [gymId, setGymId] = useState("all");
  const [confirmBackfill, setConfirmBackfill] = useState(false);
  const navigate = useNavigate();
  const backfill = useBackfillResults();
  const { data: gyms } = useGyms();

  const { data, isLoading } = useSessions({
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
    gymId: gymId === "all" ? undefined : gymId,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const runBackfill = () => {
    backfill.mutate(
      undefined,
      {
        onSuccess: (res) => {
          setConfirmBackfill(false);
          toast.success(
            `Results recomputed: ${res.processed} members recalculated from readings, ${res.zeroFilled} zero-filled, ${res.sessionsReRanked} sessions re-ranked.`,
          );
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to recompute results."),
      },
    );
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Sessions</h1>
          <p className="text-muted-foreground text-sm mt-1">Every session ever run, across every gym and trainer.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setConfirmBackfill(true)} disabled={backfill.isPending}>
          <Calculator className="h-4 w-4" />
          {backfill.isPending ? "Recomputing..." : "Recompute All Results"}
        </Button>
      </div>

      <ConfirmActionDialog
        open={confirmBackfill}
        onOpenChange={setConfirmBackfill}
        title="Recompute all session results?"
        description="Recalculates every calculation field (HR, max HR, calories, sweat/recovery points, EPOC, %MHR, rank) for all completed sessions — from raw readings where available, guaranteed zeros otherwise. This is a one-off maintenance operation and can be re-run safely."
        confirmLabel="Recompute Results"
        loading={backfill.isPending}
        onConfirm={runBackfill}
      />

      {/* Gym filter — narrows the global session list to one branch,
          same pattern as the Trainers tab's gym filter. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Gym</span>
        </div>
        <Select
          value={gymId}
          onValueChange={(v) => {
            setGymId(v);
            setPage(0);
          }}
        >
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
              <TableHead>Session</TableHead>
              <TableHead>Gym</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
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

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No sessions recorded yet.
                </TableCell>
              </TableRow>
            )}

            {rows.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/admin/sessions/${s.id}`)}>
                <TableCell className="font-medium hover:text-primary">{s.name}</TableCell>
                <TableCell>{s.gym?.name || "—"}</TableCell>
                <TableCell>{s.trainer?.name || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(s.scheduledAt ?? s.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
