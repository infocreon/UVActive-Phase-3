import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTrainer, useSuspendTrainer, useActivateTrainer } from "@/hooks/admin/useTrainers";
import { toast } from "sonner";
import { ApiError } from "@/lib/auth-context";

export default function TrainerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: trainer, isLoading } = useTrainer(id);
  const suspend = useSuspendTrainer();
  const activate = useActivateTrainer();

  const toggleStatus = () => {
    if (!trainer) return;
    const mutation = trainer.status === "active" ? suspend : activate;
    mutation.mutate(trainer.id, {
      onSuccess: () => toast.success(`${trainer.name} ${trainer.status === "active" ? "suspended" : "activated"}.`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Action failed."),
    });
  };

  return (
    <AdminLayout>
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4" onClick={() => navigate("/admin/trainers")}>
        <ArrowLeft className="h-4 w-4" /> Back to Trainers
      </Button>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {trainer && (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="font-heading text-2xl font-bold">{trainer.name}</h1>
              <p className="text-muted-foreground text-sm mt-1">{trainer.gym?.name}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className={trainer.status === "active" ? "text-destructive border-destructive/30 hover:bg-destructive/10" : ""}
              onClick={toggleStatus}
            >
              {trainer.status === "active" ? "Suspend" : "Activate"}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={trainer.status} />
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium mt-1 text-sm">{trainer.email}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium mt-1 text-sm">{trainer.phone || "—"}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <p className="font-semibold text-sm">Sessions Run</p>
            </div>
            <div className="divide-y divide-border">
              {trainer.sessions?.length ? (
                trainer.sessions.map((s) => (
                  <button
                    key={s.id}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/admin/sessions/${s.id}`)}
                  >
                    <div>
                      <p className="font-medium text-sm hover:text-primary">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <StatusBadge status={s.status} />
                      <p className="mt-1">{s._count?.members ?? 0} members</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No sessions yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
