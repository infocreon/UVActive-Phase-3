import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

export interface GymCredentials {
  gymName?: string;
  gymId?: string;
  managerEmail: string;
  temporaryPassword: string;
}

interface GymCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: GymCredentials | null;
  /** Overrides the default "{gymName} is ready" / "Manager password reset" title — used when this dialog is reused for a plain trainer's credentials instead of a branch manager's. */
  title?: string;
  /** Overrides the "Branch Portal login email" label — e.g. "Trainer login email". */
  emailLabel?: string;
}

/**
 * Shown exactly once — right after a gym (or trainer) is created, or
 * after an admin resets an account's password. This is the ONLY place
 * the plaintext temporary password is ever visible; it isn't
 * recoverable from anywhere else afterward (it's only ever stored as
 * a hash). Reused for plain trainer accounts too, not just branch
 * managers — same credential-delivery shape either way.
 */
export function GymCredentialsDialog({ open, onOpenChange, credentials, title, emailLabel }: GymCredentialsDialogProps) {
  if (!credentials) return null;

  const copyAll = () => {
    navigator.clipboard.writeText(
      `${emailLabel ?? "Branch Portal login"}\nEmail: ${credentials.managerEmail}\nTemporary password: ${credentials.temporaryPassword}`,
    );
    toast.success("Credentials copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-400" />
          </div>
          <DialogTitle className="text-center">
            {title ?? (credentials.gymName ? `${credentials.gymName} is ready` : "Manager password reset")}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-muted rounded-lg p-4 space-y-3">
          {credentials.gymId && (
            <div>
              <p className="text-xs text-muted-foreground">Gym ID</p>
              <code className="text-sm font-mono">{credentials.gymId}</code>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{emailLabel ?? "Branch Portal login email"}</p>
            <p className="text-sm font-medium">{credentials.managerEmail}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Temporary password</p>
            <code className="text-base font-mono tracking-wide">{credentials.temporaryPassword}</code>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          This password is shown once and has also been emailed to the manager. They'll set up two-factor
          authentication the first time they sign in to the Branch Portal.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={copyAll}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button type="button" className="btn-cerise" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
