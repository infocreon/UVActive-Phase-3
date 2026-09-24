import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { useAuditLog, useAuditGymOptions } from "@/hooks/admin/useAuditLog";

const PAGE_SIZE = 30;

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [targetType, setTargetType] = useState("");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [gymId, setGymId] = useState("");

  const { data: gymOptions } = useAuditGymOptions();
  const { data, isLoading } = useAuditLog({
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
    targetType: targetType || undefined,
    actorId: actorId || undefined,
    action: action || undefined,
    gymId: gymId || undefined,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const exportCsv = () => {
    const header = [
      "timestamp",
      "actor_type",
      "actor",
      "action",
      "branch",
      "target_type",
      "target",
      "ip",
      "payload",
    ];
    const csvRows = rows.map((r) =>
      [
        r.createdAt,
        r.actorType,
        r.actorName || r.actorId || "",
        r.action,
        r.gymName || r.gymId || "",
        r.targetType,
        [r.targetName, r.targetLabel].filter(Boolean).join(" · ") || r.targetId || "",
        r.ip ?? "",
        r.payload ? JSON.stringify(r.payload).replace(/"/g, '""') : "",
      ]
        .map((v) => `"${v}"`)
        .join(","),
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every mutating action across the platform — which branch, which operation, by whom, to whom.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> Export current page (CSV)
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
        <Select value={gymId || undefined} onValueChange={(v) => { setGymId(v === ALL_GYMS ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GYMS}>All branches</SelectItem>
            {(gymOptions ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by operation (e.g. gym.suspend, member.delete)..."
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by target type (e.g. gym, member, trainer)..."
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by actor ID..."
          value={actorId}
          onChange={(e) => {
            setActorId(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>To whom / what</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No matching audit entries.
                </TableCell>
              </TableRow>
            )}

            {rows.map((entry) => {
              const isOverride = !!(entry.payload as Record<string, unknown> | null)?.admin_override;
              const actorLabel = [entry.actorName, entry.actorEmail].filter(Boolean).join(" · ") || entry.actorId || "—";
              const targetLabel =
                [entry.targetName, entry.targetLabel].filter(Boolean).join(" · ") || entry.targetId || "—";
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {entry.actorType}
                    </Badge>
                    <p className="text-xs mt-1 max-w-52 truncate" title={actorLabel}>
                      {actorLabel}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5">
                      {isOverride && <ShieldAlert className="h-3.5 w-3.5 text-primary" />}
                      {entry.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.gymName ? (
                      entry.gymName
                    ) : entry.gymId ? (
                      <span className="font-mono text-xs text-muted-foreground">{entry.gymId.slice(0, 8)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="max-w-56 truncate" title={targetLabel}>
                      {targetLabel}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{entry.targetType}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.ip || "—"}</TableCell>
                </TableRow>
              );
            })}
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

// Sentinel value for the "all branches" option — Radix Select can't use ""
// as a value, so an impossible-in-practice id stands in for it.
const ALL_GYMS = "__all__";
