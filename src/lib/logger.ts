/**
 * Frontend instance logging — every unexpected frontend failure lands in
 * the browser console with a consistent `[UVActive]` prefix so support
 * can ask for a console export and read one uniform stream:
 *
 *   [UVActive] 2026-09-13T12:00:00.000Z ERROR [Gyms] Failed to load gyms  ApiError: CONFLICT ...
 *   [UVActive] 2026-09-13T12:00:00.000Z ERROR [window] uncaught TypeError: ...
 *
 * The API client's request() logs failed HTTP calls here too (see
 * api.ts), so console output carries both sides of every failure: the
 * backend's error envelope (code + message + path) and the frontend
 * surface that hit it.
 */

const PREFIX = "[UVActive]";

function stamp(): string {
  return new Date().toISOString();
}

function emit(level: "error" | "warn", scope: string, message: string, detail?: unknown) {
  const line = `${PREFIX} ${stamp()} ${level.toUpperCase()} [${scope}] ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line, detail !== undefined ? detail : "");
  } else {
    // eslint-disable-next-line no-console
    console.warn(line, detail !== undefined ? detail : "");
  }
}

export const logger = {
  error: (scope: string, message: string, detail?: unknown) => emit("error", scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => emit("warn", scope, message, detail),
};

/** Idempotent install of window-level error/unhandled-rejection handlers. */
let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logger.error(
      "window",
      `uncaught ${event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : "error"}`,
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("window", "unhandled promise rejection", event.reason);
  });
}
