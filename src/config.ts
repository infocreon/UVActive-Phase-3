/**
 * UV Active Member App — environment config.
 *
 * Same cloud API the Trainer App and both web portals talk to,
 * supplied ONLY via the EXPO_PUBLIC_API_BASE_URL env var. No backend
 * URL is hardcoded here or in eas.json — for local dev, set it in
 * .env (see .env.example); for EAS builds, set it as an "Environment
 * Variable" on the EAS project for each build profile (dev/preview/
 * production), since a local .env is not picked up by `eas build`.
 * Failing loudly here beats silently building against the wrong (or
 * a stale) backend.
 */
if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is not set. Set it in .env for local dev, ' +
      'or as an EAS "Environment Variable" on this build profile — see .env.example.',
  );
}
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
