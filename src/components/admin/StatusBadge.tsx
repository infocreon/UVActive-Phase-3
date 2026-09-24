import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  active: "border-transparent bg-green-500/15 text-green-400",
  suspended: "border-transparent bg-amber-500/15 text-amber-400",
  deleted: "border-transparent bg-muted text-muted-foreground",
  inactive: "border-transparent bg-muted text-muted-foreground",
  banned: "border-transparent bg-destructive/15 text-destructive",
  pending_transfer: "border-transparent bg-blue-500/15 text-blue-400",
  pending: "border-transparent bg-amber-500/15 text-amber-400",
  accepted: "border-transparent bg-green-500/15 text-green-400",
  declined: "border-transparent bg-destructive/15 text-destructive",
  expired: "border-transparent bg-muted text-muted-foreground",
  scheduled: "border-transparent bg-blue-500/15 text-blue-400",
  in_progress: "border-transparent bg-primary/15 text-primary",
  completed: "border-transparent bg-green-500/15 text-green-400",
  cancelled: "border-transparent bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn(STYLES[status] ?? "border-transparent bg-muted text-muted-foreground", "capitalize")}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
