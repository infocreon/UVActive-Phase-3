import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Gym, Member, Session, Trainer } from "@/lib/types";

/**
 * There is no dedicated `/admin/analytics` endpoint in the cloud API yet
 * (spec 3.5 lists this under NOW, but no controller exposes it). Until
 * that lands, the dashboard derives the same numbers client-side from the
 * existing list endpoints. This is fine at current data volumes; once
 * gyms/members/sessions grow large this should move to a real aggregation
 * endpoint (see spec §6 "Read replicas / reporting DB").
 */
export function usePlatformStats() {
  return useQuery({
    queryKey: ["admin", "platform-stats"],
    queryFn: async () => {
      const [gymsRes, membersRes, trainersRes, sessionsRes, emailStatsRes] = await Promise.all([
        api.get<Gym[]>("/admin/gyms"),
        api.get<Member[]>("/admin/members", { take: 1 }),
        api.get<Trainer[]>("/admin/trainers"),
        api.get<Session[]>("/admin/sessions", { take: 1 }),
        api.get<{ emailsSent30d: number; emailsSentTotal: number; emailsFailed30d?: number; emailsPending?: number }>(
          "/admin/notifications/stats",
        ),
      ]);

      const gyms = gymsRes.data;
      const activeGyms = gyms.filter((g) => g.status === "active").length;
      const suspendedGyms = gyms.filter((g) => g.status === "suspended").length;
      const deletedGyms = gyms.filter((g) => g.status === "deleted").length;
      const totalMembersCapacity = gyms.reduce((sum, g) => sum + (g.memberLimit || 0), 0);
      const totalMembersNow = gyms.reduce((sum, g) => sum + (g._count?.currentMembers || 0), 0);

      const trainers = trainersRes.data;
      const activeTrainers = trainers.filter((t) => t.status === "active").length;

      const topGyms = [...gyms]
        .sort((a, b) => (b._count?.currentMembers || 0) - (a._count?.currentMembers || 0))
        .slice(0, 5);

      return {
        totalGyms: gyms.length,
        activeGyms,
        suspendedGyms,
        deletedGyms,
        totalMembers: (membersRes.meta as { total?: number } | undefined)?.total ?? totalMembersNow,
        totalMembersCapacity,
        totalTrainers: trainers.length,
        activeTrainers,
        totalSessions: (sessionsRes.meta as { total?: number } | undefined)?.total ?? 0,
        topGyms,
        emailsSent30d: emailStatsRes.data.emailsSent30d,
        emailsSentTotal: emailStatsRes.data.emailsSentTotal,
        emailsFailed30d: emailStatsRes.data.emailsFailed30d ?? 0,
        emailsPending: emailStatsRes.data.emailsPending ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}
