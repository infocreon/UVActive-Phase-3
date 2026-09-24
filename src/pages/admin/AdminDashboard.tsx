import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatCard } from "@/components/admin/StatCard";
import { usePlatformStats } from "@/hooks/admin/usePlatformStats";
import { useAuditLog } from "@/hooks/admin/useAuditLog";
import { useAuth } from "@/lib/auth-context";
import { Building2, Users, Dumbbell, CalendarClock, Mail, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function AdminDashboard() {
  const { data: stats, isLoading } = usePlatformStats();
  const { isSuperAdmin } = useAuth();
  // Audit log is super_admin-only now (spec: hidden from the regular
  // Admin Panel) — don't even issue the request for a support admin,
  // it'll 403.
  const { data: recentActivity } = useAuditLog({ take: 8 }, { enabled: isSuperAdmin });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Platform Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Total control across every gym, trainer, member, and session.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            title="Total Gyms"
            value={stats?.totalGyms ?? 0}
            change={`${stats?.activeGyms ?? 0} active · ${stats?.suspendedGyms ?? 0} suspended`}
            icon={Building2}
          />
          <StatCard
            title="Total Members"
            value={stats?.totalMembers ?? 0}
            change={`of ${stats?.totalMembersCapacity ?? 0} seats platform-wide`}
            icon={Users}
          />
          <StatCard
            title="Total Trainers"
            value={stats?.totalTrainers ?? 0}
            change={`${stats?.activeTrainers ?? 0} active`}
            icon={Dumbbell}
          />
          <StatCard title="Sessions Recorded" value={stats?.totalSessions ?? 0} icon={CalendarClock} />
          <StatCard
            title="Emails Sent"
            value={stats?.emailsSent30d ?? 0}
            change={`last 30 days · ${stats?.emailsSentTotal ?? 0} all-time${
              (stats?.emailsFailed30d ?? 0) > 0 ? ` · ${stats?.emailsFailed30d} failed` : ""
            }${(stats?.emailsPending ?? 0) > 0 ? ` · ${stats?.emailsPending} pending` : ""}`}
            icon={Mail}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top gyms by member volume */}
        <div className={isSuperAdmin ? "lg:col-span-2 bg-card border border-border rounded-xl p-5" : "lg:col-span-3 bg-card border border-border rounded-xl p-5"}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold">Top Gyms by Member Volume</h2>
            <Link to="/admin/gyms" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.topGyms?.length ? (
              stats.topGyms.map((gym) => (
                <div key={gym.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{gym.name}</p>
                    <p className="text-xs text-muted-foreground">{gym.status}</p>
                  </div>
                  <div className="text-sm font-heading font-semibold">
                    {gym._count?.currentMembers ?? 0}
                    <span className="text-muted-foreground font-body font-normal"> / {gym.memberLimit}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No gyms yet.</p>
            )}
          </div>
        </div>

        {/* Recent activity — super_admin only, audit log is not a
            regular Admin Panel tab (see AdminSidebar / AuditLog route guard) */}
        {isSuperAdmin && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold">Recent Activity</h2>
              <Link to="/admin/audit-log" className="text-xs text-primary flex items-center gap-1 hover:underline">
                Full log <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentActivity?.data?.length ? (
                recentActivity.data.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-sm">
                    {entry.payload && (entry.payload as Record<string, unknown>).admin_override ? (
                      <ShieldAlert className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{entry.actorName || entry.actorType}</span> · {entry.action}
                        {entry.gymName ? ` · ${entry.gymName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
