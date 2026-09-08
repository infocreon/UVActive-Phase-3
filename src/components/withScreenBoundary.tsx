import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Wraps a screen component in its own ErrorBoundary.
 *
 * Previously there was exactly ONE ErrorBoundary in the whole app (in
 * App.tsx, around the entire RootNavigator — see that file). That meant
 * a render error thrown by ANY single screen — say, the Sensors screen
 * re-rendering after a BLE status update comes in with an unexpected
 * shape — tore down the whole app (login state, active tab, everything)
 * to one generic "Something went wrong / Try Again" screen. From the
 * trainer's point of view this looked exactly like "the Sensors screen
 * is broken", even though the actual fault was contained to a few
 * components; "Try Again" also just re-ran the same broken render, so
 * it usually error'd again immediately.
 *
 * Wrapping each screen individually here means:
 *   - A crash is visually and functionally contained to that one
 *     screen. Switching tabs / going back still works.
 *   - "Try Again" re-mounts just that screen component (remounting
 *     clears any stale local state that caused the throw, rather than
 *     re-rendering the exact same broken tree).
 *   - The top-level boundary in App.tsx is now a last-resort net for
 *     errors thrown outside any screen (nav container itself, etc.),
 *     not the everyday failure path.
 */
export function withScreenBoundary<P extends object>(
  Component: React.ComponentType<P>,
  label: string,
): React.ComponentType<P> {
  const Wrapped = (props: P) => {
    const [resetToken, setResetToken] = React.useState(0);
    return (
      <ErrorBoundary label={label} onRetry={() => setResetToken((t) => t + 1)}>
        <Component key={resetToken} {...props} />
      </ErrorBoundary>
    );
  };
  Wrapped.displayName = `withScreenBoundary(${label})`;
  return Wrapped;
}
