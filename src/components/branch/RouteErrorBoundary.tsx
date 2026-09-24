import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/**
 * Per-route error boundary. Wraps a single page (see App.tsx), not the
 * whole app — a crash on one screen shows a recoverable fallback for
 * just that screen instead of a blank white tab. Mirrors
 * uvactive-admin-panel-updated's RouteErrorBoundary and
 * uvactive-trainer-app's withScreenBoundary so all three apps fail the
 * exact same way.
 */
export function withRouteBoundary<P extends object>(Wrapped: React.ComponentType<P>, screenName: string) {
  return function Bounded(props: P) {
    return (
      <RouteErrorBoundary screenName={screenName}>
        <Wrapped {...props} />
      </RouteErrorBoundary>
    );
  };
}

interface State { hasError: boolean; }

export class RouteErrorBoundary extends Component<{ children: ReactNode; screenName: string }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    logger.error(this.props.screenName, "render error:", [error, info]);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-sm text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="font-heading text-lg font-semibold">This page ran into a problem</h2>
            <p className="text-sm text-muted-foreground">
              {this.props.screenName} hit an unexpected error. The rest of the app is unaffected — try reloading just
              this page.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button variant="outline" onClick={() => window.history.back()}>
                Go back
              </Button>
              <Button onClick={() => this.setState({ hasError: false })}>Retry</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
