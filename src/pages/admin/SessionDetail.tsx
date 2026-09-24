import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy } from "lucide-react";
import { useSession } from "@/hooks/admin/useSessions";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession(id);

  // Highest score first — this IS the post-workout leaderboard, not just
  // an enrollment list, per spec ("click the session to see the
  // leaderboard of that session").
  const leaderboard = useMemo(() => {
    const members = session?.members ?? [];
    return [...members].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  }, [session]);

  return (
    <AdminLayout>
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4" onClick={() => navigate("/admin/sessions")}>
        <ArrowLeft className="h-4 w-4" /> Back to Sessions
      </Button>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {session && (
        <>
          <div className="mb-6">
            <h1 className="font-heading text-2xl font-bold">{session.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {session.gym?.name} · Trainer: {session.trainer?.name || "—"}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={session.status} />
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Capacity</p>
              <p className="font-medium mt-1">{session.members?.length ?? 0} / {session.capacity}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="font-medium mt-1">{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString() : "—"}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Ended</p>
              <p className="font-medium mt-1">{session.endedAt ? new Date(session.endedAt).toLocaleString() : "—"}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Leaderboard</p>
            </div>
            <div className="divide-y divide-border">
              {leaderboard.length ? (
                leaderboard.map((sm, i) => (
                  <button
                    key={sm.id}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/admin/sessions/${id}/athlete/${sm.memberId}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-sm font-mono text-muted-foreground">{sm.finalRank ?? i + 1}</span>
                      <div>
                        <p className="font-medium text-sm hover:text-primary">{sm.member?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{sm.member?.memberCode}</p>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <p>Avg HR: {sm.avgHr ?? "—"} · Peak HR: {sm.maxHr ?? "—"} · Cal: {sm.calories ?? "—"}</p>
                      <p className="text-muted-foreground">
                        Max %HR: {sm.maxPctMhr != null ? `${Math.round(sm.maxPctMhr)}%` : "0%"} · Sweat: {sm.sweatPoints ?? "—"} · Recovery: {sm.recoveryPoints ?? "0"}{sm.recoveryGrade ? ` (${sm.recoveryGrade})` : ""} · EPOC: {sm.epocCalories != null ? `${Math.round(sm.epocCalories)} kcal` : "—"}{sm.consistencyPct != null ? ` · Consistency: ${Math.round(sm.consistencyPct)}%` : ""}
                      </p>
                      <p className="text-muted-foreground capitalize">Score: {sm.score ?? "—"} · {sm.attendance.replace(/_/g, " ")}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No members enrolled.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground p-4 border-t border-border">
              Click a member to see their full post-workout result for this session (points, EPOC, %HR, and a
              BPM graph).
            </p>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
