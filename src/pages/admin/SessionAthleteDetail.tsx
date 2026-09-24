import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { useSession, useSessionAthleteTicks, useRecalculateSession } from "@/hooks/admin/useSessions";
import { ApiError } from "@/lib/auth-context";

// ── Leaderboard drill-down: one member's full post-workout stat ──────
// Route: /admin/sessions/:id/athlete/:memberId. Reached by tapping a
// leaderboard row; the Branch Portal has the equivalent drill-down
// inline in its Sessions page. Shows Rank, UV Points, Sweat Points,
// Recovery Points, Calories, EPOC, Avg/Peak BPM, Max %HR, and a
// single-line, horizontally-scrollable second-by-second BPM graph.
const BPM_LINE_COLOR = "#EF4444";
const MIN_PX_PER_TICK = 4;

// Zone palette — matches the Trainer App's ZONE_COLOURS so the
// distribution bars agree with the live app the trainer used.
const ZONE_COLORS: Record<number, string> = {
  0: "#39FF14", 1: "#669FFF", 2: "#4263CF", 3: "#1E2C7C", 4: "#FF5E73", 5: "#FF0000",
};
const ZONE_NAMES: Record<number, string> = {
  0: "Standby", 1: "Recovery", 2: "Aerobic", 3: "Fitness", 4: "Burn", 5: "Peak",
};

export default function SessionAthleteDetail() {
  const { id: sessionId, memberId } = useParams<{ id: string; memberId: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession(sessionId);
  const { data: ticksData, isLoading } = useSessionAthleteTicks(sessionId, memberId);
  const recalc = useRecalculateSession();

  const member = session?.members?.find((m) => m.memberId === memberId);
  const rank =
    member?.finalRank ??
    (session?.members
      ? session.members.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).findIndex((m) => m.memberId === memberId) + 1
      : null) ??
    null;

  const chartData = (ticksData?.ticks ?? []).map((p) => ({
    time: format(new Date(p.ts), "h:mm:ss a"),
    bpm: p.bpm,
  }));
  const chartWidth = Math.max(chartData.length * MIN_PX_PER_TICK, 600);

  // Zone distribution — seconds per zone across the session, from the
  // same per-second tick stream the BPM curve uses. Rendered as a
  // zone-colored bar chart so the "how much time in each zone" split
  // is visible at a glance, matching the Trainer App's distribution.
  const zoneSeconds = [0, 0, 0, 0, 0, 0];
  for (const t of ticksData?.ticks ?? []) {
    const z = t.zone ?? 0;
    if (z >= 0 && z <= 5) zoneSeconds[z] += 1;
  }
  const totalZoneSeconds = zoneSeconds.slice(1).reduce((a, b) => a + b, 0);
  const zoneData = [1, 2, 3, 4, 5].map((z) => ({
    zone: z,
    name: ZONE_NAMES[z],
    minutes: Math.round((zoneSeconds[z] / 60) * 10) / 10,
    pct: totalZoneSeconds > 0 ? Math.round((zoneSeconds[z] / totalZoneSeconds) * 100) : 0,
    color: ZONE_COLORS[z],
  }));

  return (
    <AdminLayout>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2 mb-4"
        onClick={() => navigate(sessionId ? `/admin/sessions/${sessionId}` : "/admin/sessions")}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Session
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {member?.member?.name ?? "Member"}
            {member?.member?.memberCode ? (
              <span className="ml-2 text-xs text-muted-foreground font-mono align-middle">{member.member.memberCode}</span>
            ) : null}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{session?.name}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!sessionId || recalc.isPending}
          onClick={() =>
            sessionId &&
            recalc.mutate(sessionId, {
              onSuccess: () => toast.success("Recalculated from sensor readings."),
              onError: (err) => toast.error(err instanceof ApiError ? err.message : "Recalculate failed."),
            })
          }
        >
          <Calculator className="h-3.5 w-3.5" />
          {recalc.isPending ? "Recalculating…" : "Recalculate"}
        </Button>
      </div>

      {/* Every calculated field shows a real 0 / 0% rather than a dash
          once the session has ended — a dash means "no data at all",
          never "calculated to zero". Tap Recalculate to force a fresh
          compute from the raw sensor log. */}
      <div className="grid grid-cols-3 gap-2 text-center max-w-3xl">
        <StatBox label="Rank" value={rank != null ? `#${rank}` : "—"} />
        <StatBox label="UV Points" value={String(Math.round((member?.score ?? 0) * 10) / 10)} />
        <StatBox label="Sweat Points" value={String(Math.round((member?.sweatPoints ?? 0) * 10) / 10)} />
        <StatBox label="Recovery Points" value={String(Math.round((member?.recoveryPoints ?? 0) * 10) / 10)} />
        {/* Graded recovery + Avg %HR + interval consistency — the spec
            fields this drill-down was still missing. Grade appears once
            the cloud stamps one (end() or a Recalculate); consistency
            only for sessions run with target-zone intervals. */}
        <StatBox label="Recovery Grade" value={member?.recoveryGrade ?? "—"} />
        <StatBox label="Calories" value={`${Math.round(member?.calories ?? 0)} kcal`} />
        <StatBox label="EPOC (kcal)" value={String(Math.round(member?.epocCalories ?? 0))} />
        <StatBox label="Avg BPM" value={member?.avgHr ?? "—"} />
        <StatBox label="Peak BPM" value={member?.maxHr ?? "—"} />
        <StatBox label="Avg %HR" value={member?.avgPctMhr != null ? `${Math.round(member.avgPctMhr)}%` : "—"} />
        <StatBox label="Max %HR" value={`${Math.round(member?.maxPctMhr ?? 0)}%`} />
        <StatBox label="Consistency" value={member?.consistencyPct != null ? `${Math.round(member.consistencyPct)}%` : "—"} />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 mt-6 max-w-3xl">
        <p className="text-sm font-medium mb-2">Heart Rate Curve</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Loading BPM graph…</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground py-10 text-center">No second-by-second BPM data available for this session yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ width: chartWidth, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={["dataMin - 10", "dataMax + 10"]} />
                  <RTooltip />
                  <Line
                    type="monotone"
                    dataKey="bpm"
                    stroke={BPM_LINE_COLOR}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Zone distribution — colored bars for time spent in each zone */}
      <div className="bg-card border border-border rounded-xl p-4 mt-6 max-w-3xl">
        <p className="text-sm font-medium mb-2">Zone Distribution</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading zone distribution…</p>
        ) : totalZoneSeconds === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">No zone time recorded for this session.</p>
        ) : (
          <>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip formatter={(v) => [`${v} min`, "Time"]} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                  <Bar dataKey="minutes" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {zoneData.map((d) => (
                      <Cell key={d.zone} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {zoneData.map((d) => (
                <span key={d.zone} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}: {d.minutes}m ({d.pct}%)
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg py-2 px-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
