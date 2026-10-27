import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

interface SessionTimeoutDialogProps {
  open: boolean;
  remainingTime: number;
  onContinue: () => void;
  onLogout: () => void;
}

export function SessionTimeoutDialog({
  open,
  remainingTime,
  onContinue,
  onLogout,
}: SessionTimeoutDialogProps) {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent data-testid="dialog-session-timeout">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Session About to Expire
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>Your session will expire due to inactivity.</p>
            <p className="text-lg font-semibold text-foreground">
              Time remaining: {formatTime(remainingTime)}
            </p>
            <p>
              Click "Stay Logged In" to continue your session, or "Log Out" to
              end your session now.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onLogout}
            data-testid="button-session-logout"
          >
            Log Out
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onContinue}
            data-testid="button-session-continue"
          >
            Stay Logged In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SessionTimeoutDialog;
